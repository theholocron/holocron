import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { NotificationsLayout } from "../../plugin/index.js";
import { loadConfig } from "../config-system.js";

/** This repository's root: its own real `holocron.config.ts` and `.holocron/` are loaded, not a copy. */
const REPO_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
/** The remote the layers are derived from (#2069); the real checkout's `origin` is never read. */
const SLUG = "theholocron/holocron";
const gitExec = async () => `https://github.com/${SLUG}.git`;
const CONFIG_URL = new URL("../../../../../holocron.config.ts", import.meta.url);

/**
 * The fully resolved config as it was before #1747 moved anything (commit `e7fca267c`), produced by running the loader
 * on that commit's `holocron.config.ts` in a scratch directory. Two things in it are not stable across checkouts, so
 * they are normalised on both sides: `repo.name` (read from the git remote, absent without one) and the `test:unit`
 * task's `with.uploads` (one Codecov upload per workspace package, so it changes whenever a package is added).
 */
const SNAPSHOT = new URL("./holocron-self-adoption.pre-move.snapshot.json", import.meta.url);
/** Secrets removed on purpose after the move (#1864 follow-up): nothing reads them any more (super-linter, Storybook sandbox). */
const DEAD_SECRETS = [
	"STORYBOOK_CODE_SANDBOX_API_TOKEN",
	"SUPER_LINTER_APP_ID",
	"SUPER_LINTER_GPG_PASSPHRASE",
	"SUPER_LINTER_GPG_PRIVATE_KEY",
	"SUPER_LINTER_PRIVATE_KEY",
	// The Sentry DSN is a public ingest key: the synced variable `HOLOCRON_SENTRY_DSN` replaced both secrets.
	"NEXT_PUBLIC_SENTRY_DSN",
	"SENTRY_DSN",
	// The Lighthouse token is no longer synced to an org secret; a repo that runs Lighthouse holds it at repo scope.
	"LHCI_GITHUB_APP_TOKEN",
];
const UPLOADS = "<workspace-derived: one codecov upload per package>";

/** The keys that moved into `.holocron/repo.ts` (#1787); `defaultBranch`, `protection` and `properties` stay inline. */
const MOVED_REPO_KEYS = ["teams", "topics", "variables", "secrets"];

type Resolved = Awaited<ReturnType<typeof loadConfig>>["resolved"];

/** Drop the checkout-dependent values (see `SNAPSHOT`) so two resolutions can be compared with `toEqual`. */
function normalise(resolved: Resolved): Record<string, unknown> {
	const copy = structuredClone(resolved) as unknown as {
		repo?: { name?: string };
		tasks: { name?: string; with?: { uploads?: unknown } }[];
	};
	if (copy.repo) delete copy.repo.name;
	for (const task of copy.tasks) {
		if (task.name === "test:unit" && task.with) task.with.uploads = UPLOADS;
	}
	return copy as unknown as Record<string, unknown>;
}

type NotificationsTuple = { options: { guildId: string; layout?: NotificationsLayout } };
const notificationsOf = (resolved: Resolved) =>
	(resolved.providers.notifications as unknown as { tuples: NotificationsTuple[] }).tuples[0];

/** The raw default export of `holocron.config.ts`: what the file itself says, before the loader places `.holocron/`. */
async function rawConfig() {
	return (await import(/* @vite-ignore */ CONFIG_URL.href)).default as {
		repo: Record<string, unknown>;
		tasks: unknown[];
		providers: Record<string, unknown> & { notifications: [string, Record<string, unknown>] };
	};
}

describe("holocron's own config adopts .holocron/ (#1806)", () => {
	it("keeps no layout and none of the moved repo keys inline in holocron.config.ts", async () => {
		// This is what fails if a layout or a `repo` block is put back inline.
		const raw = await rawConfig();
		expect(raw.providers.notifications[1]).not.toHaveProperty("layout");
		expect(raw.providers.notifications[1]).toHaveProperty("guildId");
		for (const key of MOVED_REPO_KEYS) expect(raw.repo).not.toHaveProperty(key);
	});

	it("keeps defaultBranch, tasks, protection, properties and the other providers inline", async () => {
		const raw = await rawConfig();
		expect(raw.repo.defaultBranch).toBe("alpha");
		// `protection` and `properties` come from the preset spread, still in this file's evaluated export.
		expect(raw.repo).toHaveProperty("protection");
		expect(raw.repo).toHaveProperty("properties");
		expect(raw.tasks.length).toBeGreaterThan(0);
		expect(Object.keys(raw.providers)).toEqual(
			expect.arrayContaining(["credentials", "vault", "errors", "monitoring", "logs", "projects", "wiki"])
		);
	});

	it("takes the layout and the repo keys from .holocron/ when loaded", async () => {
		const { resolved } = await loadConfig(REPO_ROOT, { gitExec });
		const { options } = notificationsOf(resolved);
		expect(options.guildId).toBe("1303969001822486568");
		expect(options.layout?.pinned).toContainEqual({ channel: "rules", file: ".holocron/pinned/rules.md" });
		expect(options.layout?.webhookAvatar).toBe(".holocron/media/webhook-avatar.png");
		const repo = resolved.repo as Record<string, unknown>;
		for (const key of MOVED_REPO_KEYS) expect(repo[key]).toBeDefined();
		expect(repo.defaultBranch).toBe("alpha");
	});

	it("resolves to the same config as before the move, apart from the two moved paths", async () => {
		const expected = JSON.parse(await readFile(SNAPSHOT, "utf8")) as Record<string, unknown>;
		// The deliberate differences (#1788): the avatar and the rules file moved into `.holocron/`. Applied here, in the
		// open, so a change to anything else shows up as a diff instead of being absorbed by the snapshot.
		const { options } = notificationsOf(expected as unknown as Resolved);
		expect(options.layout?.webhookAvatar).toBe("media/webhook-avatar.png");
		options.layout!.webhookAvatar = ".holocron/media/webhook-avatar.png";
		const rules = options.layout?.pinned?.find((pin) => pin.channel === "rules");
		expect(rules).toEqual({ channel: "rules", file: "RULES.md" });
		rules!.file = ".holocron/pinned/rules.md";
		// And (#2131): the layout names who reads the notification secrets.
		expect(options.layout?.readers).toBeUndefined();
		options.layout!.readers = ["theholocron/holocron", "theholocron/.github"];
		// And (#1822): the ideas forum gained a default reaction and starter reactions.
		const ideas = (options.layout?.categories ?? [])
			.flatMap((c) => c.channels ?? [])
			.find((c) => c.name === "ideas");
		expect(ideas?.defaultReaction).toBeUndefined();
		Object.assign(ideas!, { defaultReaction: "👍", starterReactions: ["👍", "👎", "❓"] });
		// And (#1834): the `prs` forum, the pull-request feed's, sits after `ideas` in BUILD. Its eight tags are the ones
		// `forumLayoutProblem` demands, and it has the same starter reactions as `ideas` with 🔀 as its default; anything
		// else about it showing up here would be a diff.
		const build = options.layout?.categories?.find((c) => c.name === "BUILD");
		const ideasAt = build!.channels!.findIndex((c) => c.name === "ideas");
		expect(build!.channels!.some((c) => c.name === "prs")).toBe(false);
		build!.channels!.splice(ideasAt + 1, 0, {
			name: "prs",
			kind: "forum",
			topic: "One post for each pull request, tagged with its state and kept up to date. Open the post to follow the review; comment on GitHub, not here.",
			tags: [
				{ name: "draft", emoji: "✏️", moderated: true },
				{ name: "conflicts", emoji: "⚔️", moderated: true },
				{ name: "failing", emoji: "❌", moderated: true },
				{ name: "changes requested", emoji: "🔧", moderated: true },
				{ name: "ready", emoji: "✅", moderated: true },
				{ name: "waiting", emoji: "⏳", moderated: true },
				{ name: "merged", emoji: "🟣", moderated: true },
				{ name: "closed", emoji: "🚫", moderated: true },
			],
			defaultReaction: "🔀",
			starterReactions: ["👍", "👎", "❓"],
			feeds: { prs: true },
		});
		// And (#1817): the three organization variables are no longer literals but come from a 1Password Environment.
		const repoBefore = (expected as { repo: { variables?: unknown } }).repo;
		expect(repoBefore.variables).toEqual({
			org: { AXIOM_DATASET: "holocron-ci", CLOUDFLARE_ACCOUNT_ID: expect.any(String), TURBO_TEAM: "iamnewton" },
		});
		repoBefore.variables = {
			sync: [
				{
					environment: `${SLUG} - ci`,
					scope: "org=theholocron",
					keys: [
						"HOLOCRON_AXIOM_DATASET",
						"HOLOCRON_AXIOM_ORG",
						"HOLOCRON_CLOUDFLARE_ACCOUNT_ID",
						"HOLOCRON_CLOUDFLARE_PAGES_PROJECT",
						"HOLOCRON_POSTHOG_PROJECT_TOKEN",
						"HOLOCRON_SENTRY_DSN",
						"HOLOCRON_SENTRY_ORG",
						"HOLOCRON_TURBO_TEAM",
						"HOLOCRON_VERCEL_TEAM_ID",
						"SENTINEL_AXIOM_DATASET",
						"SENTINEL_GITHUB_APP_ID",
					],
				},
			],
		};
		// And (#1864): eight synced secrets are named `HOLOCRON_<NAME>` now; the files hold the same values and tokens.
		const secretRenames: Record<string, string> = {
			AXIOM_TOKEN: "HOLOCRON_AXIOM_TOKEN",
			CLOUDFLARE_API_TOKEN: "HOLOCRON_CLOUDFLARE_TOKEN",
			CODECOV_TOKEN: "HOLOCRON_CODECOV_TOKEN",
			FERN_TOKEN: "HOLOCRON_FERN_TOKEN",
			VERCEL_PROTECTION_BYPASS_SECRET: "HOLOCRON_VERCEL_PROTECTION_BYPASS_SECRET",
			VERCEL_TOKEN: "HOLOCRON_VERCEL_TOKEN",
			SENTRY_AUTH_TOKEN: "HOLOCRON_SENTRY_RELEASE_TOKEN",
			TURBO_TOKEN: "HOLOCRON_TURBO_TOKEN",
		};
		const secretEntries = (expected as unknown as { repo: { secrets: { sync: { keys: string[] }[] } } }).repo
			.secrets.sync;
		for (const entry of secretEntries) {
			// And (#2069): the entries name the `ci` layer, so the Environment is `<org/repo> - ci`.
			Object.assign(entry, { environment: `${SLUG} - ci` });
			entry.keys = entry.keys
				.filter((key) => !DEAD_SECRETS.includes(key) && key !== "SENTINEL_GITHUB_APP_ID") // a public id: a variable now
				.map((key) => secretRenames[key] ?? key)
				.sort();
		}
		// And (#2062): the organization entry is two, each with its readers. The first is read by `holocron` and the
		// frozen reusables in `.github`; the second only by holocron's own workflows.
		const onlyHolocron = [
			"HOLOCRON_CLOUDFLARE_TOKEN",
			"HOLOCRON_CODECOV_TOKEN",
			"HOLOCRON_SENTRY_RELEASE_TOKEN",
			"HOLOCRON_TURBO_TOKEN",
			"SENTINEL_GITHUB_APP_PRIVATE_KEY",
		];
		const orgEntry = secretEntries.find((entry) => (entry as { scope?: string }).scope === "org=theholocron")!;
		secretEntries.splice(
			secretEntries.indexOf(orgEntry),
			1,
			{
				...orgEntry,
				keys: orgEntry.keys.filter((key) => !onlyHolocron.includes(key)),
				repos: ["theholocron/holocron", "theholocron/.github"],
			} as never,
			{
				...orgEntry,
				keys: orgEntry.keys.filter((key) => onlyHolocron.includes(key)),
				repos: ["theholocron/holocron"],
			} as never
		);
		// And (#1727): `SENTRY_ORG` is a synced variable too (the release workflow reads it); the Sentry `errors` entry
		// is unchanged, its `org` now filled from `.holocron/org.ts` instead of written inline.
		// And (#1827): the Cloudflare `accountId` is no longer a literal in the presets (the plugin reads
		// CLOUDFLARE_ACCOUNT_ID through the credential chain), and the Environment that holds it is a second
		// `credentials` entry.
		const expectedProviders = (expected as unknown as { providers: Record<string, unknown> }).providers;
		for (const key of ["deployment", "workers"]) {
			const { tuple } = expectedProviders[key] as { tuple: { options: Record<string, unknown> } };
			expect(tuple.options).toEqual({ accountId: expect.any(String) });
			tuple.options = {};
		}
		const { tuples } = expectedProviders.credentials as { tuples: unknown[] };
		// And (#2063): the two literal Environments are one entry with none; the names are derived from the remote.
		tuples.splice(0, tuples.length, {
			provider: "1password",
			packageName: "@theholocron/holocron-plugin-1password",
			options: {},
		});

		// And (#2022): the `ideas` provider, the Obsidian vault the inbox of ideas lives in (SPEC-0072). It is the one
		// provider added after the snapshot was taken.
		expect(expectedProviders.ideas).toBeUndefined();
		expectedProviders.ideas = {
			cardinality: "single",
			tuple: {
				provider: "obsidian",
				packageName: "@theholocron/holocron-plugin-obsidian",
				options: { vault: "The Holocron" },
			},
		};

		// And (#1851): the registered GitHub App instances `doctor github-app` checks.
		(expected as unknown as { githubApps: unknown }).githubApps = [
			{ name: "Sentinel", manifest: "apps/sentinel/github-app.manifest.json", environment: `${SLUG} - prod` },
			{
				name: "Sentinel - dev",
				manifest: "apps/sentinel/github-app.manifest.json",
				environment: `${SLUG} - dev`,
			},
		];
		// And (#2069): the vault is the `ci` layer's Environment.
		const vault = expectedProviders.vault as { tuple: { options: Record<string, unknown> } };
		expect(vault.tuple.options).toEqual({ environment: "Holocron - GitHub Actions" });
		vault.tuple.options = { environment: `${SLUG} - ci` };

		// And (#2041): the names `doctor secrets --shared` does not report because two places hold them on purpose.
		const doctorBefore = (expected as unknown as { doctor: { sharedVariables?: string[] } }).doctor;
		expect(doctorBefore.sharedVariables).toBeUndefined();
		doctorBefore.sharedVariables = [
			"HOLOCRON_ADMIN_TOKEN",
			"HOLOCRON_AXIOM_ORG",
			"HOLOCRON_AXIOM_TOKEN",
			"HOLOCRON_CLOUDFLARE_TOKEN",
			"HOLOCRON_DEPLOY_TOKEN",
			"HOLOCRON_DISCORD_BOT_TOKEN",
			"HOLOCRON_ENVIRONMENT",
			"HOLOCRON_FERN_TOKEN",
			"HOLOCRON_ISSUES_TOKEN",
			"HOLOCRON_ORG_TOKEN",
			"HOLOCRON_READ_TOKEN",
			"HOLOCRON_RELEASE_TOKEN",
			"HOLOCRON_SECRETS_TOKEN",
			"HOLOCRON_SYNC_TOKEN",
			"HOLOCRON_USER_SYNC_TOKEN",
			"SENTINEL_AXIOM_DATASET",
			"SENTINEL_AXIOM_INGEST_TOKEN",
			"SENTINEL_GITHUB_APP_ID",
			"SENTINEL_GITHUB_APP_PRIVATE_KEY",
			"SENTINEL_OP_SERVICE_ACCOUNT_TOKEN",
		];

		const { resolved } = await loadConfig(REPO_ROOT, { gitExec });
		expect(normalise(resolved)).toEqual(expected);
	});
});
