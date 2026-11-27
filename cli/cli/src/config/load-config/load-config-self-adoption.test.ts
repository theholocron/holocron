import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { relaySourcesProblem } from "../../commands/relay-sources/index.js";
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

/** Marks the named tasks of the pre-move snapshot as run by Sentinel (`sentinel: true`), as the config now says. */
function markSentinelTasks(config: { tasks: { name?: string; sentinel?: boolean }[] }, names: string[]) {
	for (const task of config.tasks) {
		if (task.name && names.includes(task.name)) {
			expect(task.sentinel).toBeUndefined();
			task.sentinel = true;
		}
	}
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

	it("relays Sentinel's failed Vercel builds, scoped to the project Sentinel's own config names (#2519)", async () => {
		const { resolved } = await loadConfig(REPO_ROOT, { gitExec });
		const { options } = notificationsOf(resolved);
		const vercel = options.layout?.relay?.sources?.vercel;
		expect(vercel).toMatchObject({ capability: "deployment", provider: "vercel", events: ["deployment.error"] });
		const sentinel = await readFile(
			new URL("../../../../../apps/sentinel/holocron.config.ts", import.meta.url),
			"utf8"
		);
		const projectId = /"vercel-project":\s*"(prj_[A-Za-z0-9]+)"/.exec(sentinel)?.[1];
		expect(projectId).toBeDefined();
		expect(vercel?.scope).toEqual([projectId]);
		expect(relaySourcesProblem(options.layout!)).toBeUndefined();
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
		// And (#2465): Cloudflare's alerts reach #alerts through the relay, a source of its own made at the vendor.
		expect(options.layout?.relay?.sources).toBeUndefined();
		options.layout!.relay!.sources = {
			cloudflare: { capability: "dns", events: ["incident_alert", "universal_ssl_event_type"] },
			// And (#2519): Sentinel's failed Vercel builds, through a provider the root config does not name.
			vercel: {
				capability: "deployment",
				provider: "vercel",
				events: ["deployment.error"],
				scope: ["prj_VyAhqahUbk1O3wzBhhQTzrwF5cWV"],
			},
			dependabot: { capability: "source", scope: ["theholocron/holocron"], events: ["dependabot_alert"] },
		};
		const alerts = (options.layout?.categories ?? [])
			.flatMap((c) => c.channels ?? [])
			.find((c) => c.name === "alerts");
		expect(alerts?.feeds).toBeUndefined();
		alerts!.feeds = { relay: { cloudflare: true, vercel: true, dependabot: true } };
		// And (#2366): the `incidents` forum, the status page incident feed's, sits after `uptime` in ALERTS.
		const alertsCategory = options.layout?.categories?.find((c) => c.channels?.some((c) => c.name === "uptime"));
		const uptimeAt = alertsCategory!.channels!.findIndex((c) => c.name === "uptime");
		expect(alertsCategory!.channels!.some((c) => c.name === "incidents")).toBe(false);
		alertsCategory!.channels!.splice(uptimeAt + 1, 0, {
			name: "incidents",
			kind: "forum",
			access: { post: [] },
			topic: "One post for each status page incident, tagged with its status and kept up to date. Updates are appended; comment on the status page, not here.",
			tags: [
				{ name: "investigating", emoji: "🔍", moderated: true },
				{ name: "identified", emoji: "🎯", moderated: true },
				{ name: "monitoring", emoji: "👀", moderated: true },
				{ name: "resolved", emoji: "✅", moderated: true },
				{ name: "maintenance", emoji: "🛠️", moderated: true },
			],
			defaultReaction: "👀",
			starterReactions: ["👀", "👍", "❓"],
			feeds: { incidents: "The Holocron" },
		});
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
		// And (#2412): the `prs` forum's reactions are server emoji made from Octicons under `.holocron/media/emoji/`.
		const prs = build!.channels!.find((c) => c.name === "prs")!;
		Object.assign(prs, {
			defaultReaction: { emoji: ":git_pull_request:", image: ".holocron/media/emoji/git_pull_request.png" },
			starterReactions: [
				"👍",
				"👎",
				"❓",
				{ emoji: ":git_merge:", image: ".holocron/media/emoji/git_merge.png" },
				{ emoji: ":git_branch:", image: ".holocron/media/emoji/git_branch.png" },
			],
		});
		// And (#2412): the `prs` forum's tags show the server's `git-*` emoji (the red cross, shared by two states, stays Unicode).
		const tagEmoji: Record<string, string> = {
			draft: ":git_pull_request_draft:",
			conflicts: "❌",
			failing: "❌",
			"changes requested": ":git_compare:",
			ready: ":git_branch_check:",
			waiting: ":git_branch:",
			merged: ":git_merge:",
			closed: ":git_pull_request_closed:",
		};
		for (const tag of prs.tags ?? []) tag.emoji = tagEmoji[tag.name];
		// And (#2412): the rest of the Octicons `git-*` set is declared on the layout, named by no reaction.
		expect(options.layout?.emojis).toBeUndefined();
		options.layout!.emojis = [
			"git_branch_check",
			"git_commit",
			"git_compare",
			"git_merge_queue",
			"git_pull_request_closed",
			"git_pull_request_draft",
			"git_pull_request_agent",
			"git_draft_agent",
			"git_closed_agent",
			"git_merge_agent",
			"git_merge_queue_agent",
			"git_pull_request_locked",
			"git_pull_request_unlisted",
		].map((name) => ({ emoji: `:${name}:`, image: `.holocron/media/emoji/${name}.png` }));
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
						"HOLOCRON_CLOUDFLARE_ACCOUNT_ID",
						"HOLOCRON_CLOUDFLARE_PAGES_PROJECT",
						"HOLOCRON_POSTHOG_PROJECT_TOKEN",
						"HOLOCRON_SENTRY_DSN",
						"HOLOCRON_SENTRY_ORG",
						"HOLOCRON_TURBO_TEAM",
						"HOLOCRON_VERCEL_TEAM_ID",
						"SENTINEL_GITHUB_APP_ID",
					],
				},
			],
		};
		// And (#1864): eight synced secrets are named `HOLOCRON_<NAME>` now; the files hold the same values and tokens.
		const secretRenames: Record<string, string> = {
			AXIOM_TOKEN: "HOLOCRON_AXIOM_TOKEN",
			CLOUDFLARE_API_TOKEN: "HOLOCRON_CLOUDFLARE_TOKEN",
			CODECOV_TOKEN: "HOLOCRON_CODECOV_UPLOAD_TOKEN",
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
		// And (#2210): the daily `check-tokens` workflow reads `HOLOCRON_USER_SYNC_TOKEN`, so the repository-scoped entry
		// syncs it too; before, the job got an empty value and never checked it.
		const repoEntry = secretEntries.find((entry) => (entry as { scope?: string }).scope === undefined)!;
		repoEntry.keys = [...repoEntry.keys, "HOLOCRON_USER_SYNC_TOKEN"].sort();
		// And (#2366): the `sync-incidents` workflow reads the Checkly key that lists the status page's incidents.
		repoEntry.keys = [...repoEntry.keys, "HOLOCRON_CHECKLY_TOKEN"].sort();
		// And (#2359): the heartbeats' ping URLs, one repository secret each, in an entry before the unscoped one.
		secretEntries.splice(secretEntries.indexOf(repoEntry), 0, {
			environment: `${SLUG} - ci`,
			scope: "repo",
			keys: [
				"HOLOCRON_HEARTBEAT_CHECK_TOKENS",
				"HOLOCRON_HEARTBEAT_DOCTOR_TOKENS",
				"HOLOCRON_HEARTBEAT_RECONCILE_PROJECTS",
				"HOLOCRON_HEARTBEAT_SYNC_INCIDENTS",
				"HOLOCRON_HEARTBEAT_SYNC_SPECS",
			],
		} as (typeof secretEntries)[number]);
		// And (#2062): the organization entry is two, each with its readers. The first is read by `holocron` and the
		// frozen reusables in `.github`; the second only by holocron's own workflows.
		const onlyHolocron = [
			"HOLOCRON_CLOUDFLARE_TOKEN",
			"HOLOCRON_CODECOV_UPLOAD_TOKEN",
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
			// And (the `token` probe's zone): `.holocron/org.ts` fills the org's zone into every `cloudflare` entry.
			tuple.options = { zone: "theholocron.dev" };
		}
		// And (#2302): the root `monitoring` entry declares the docs site's check (Sentinel's and Comlink's are in their own
		// configs), the dashboard that shows every check tagged for a component, and the public status page whose
		// components are tied to checks by the same tags.
		const monitoring = expectedProviders.monitoring as { tuple: { options: Record<string, unknown> } };
		expect(monitoring.tuple.options.checks).toBeUndefined();
		monitoring.tuple.options.checks = [
			{
				name: "Docs",
				url: "https://docs.theholocron.dev/holocron/",
				locations: ["us-east-1"],
				tags: ["docs"],
				assertions: [{ source: "status_code", comparison: "equals", target: "200" }],
			},
		];
		// And (#2359): a heartbeat for each scheduled workflow that pings one.
		monitoring.tuple.options.heartbeats = [
			{ name: "check-tokens", period: 1, periodUnit: "days", grace: 6, graceUnit: "hours", tags: ["scheduled"] },
			{ name: "doctor-tokens", period: 1, periodUnit: "days", grace: 6, graceUnit: "hours", tags: ["scheduled"] },
			{ name: "sync-specs", period: 1, periodUnit: "hours", grace: 2, graceUnit: "hours", tags: ["scheduled"] },
			{
				name: "sync-incidents",
				period: 10,
				periodUnit: "minutes",
				grace: 30,
				graceUnit: "minutes",
				tags: ["scheduled"],
			},
			{
				name: "reconcile-projects",
				period: 1,
				periodUnit: "hours",
				grace: 2,
				graceUnit: "hours",
				tags: ["scheduled"],
			},
		];
		monitoring.tuple.options.dashboards = [
			{
				name: "The Holocron",
				description: (expected as unknown as { description: string }).description,
				tags: ["sentinel", "comlink", "docs"],
				private: false,
				domain: "status.theholocron.dev",
				logo: "https://docs.theholocron.dev/holocron/logos/profile.v2.jpeg",
				favicon: "https://docs.theholocron.dev/holocron/favicon.svg",
				link: "https://docs.theholocron.dev/holocron/",
			},
		];
		monitoring.tuple.options.statusPages = [
			{
				name: "The Holocron",
				slug: "theholocron",
				description: (expected as unknown as { description: string }).description,
				footer: "The Holocron: the status of Sentinel, Comlink and the docs site.",
				privacyUrl: "https://docs.theholocron.dev/holocron/legal/privacy/",
				termsUrl: "https://docs.theholocron.dev/holocron/legal/terms/",
				supportUrl: "https://docs.theholocron.dev/holocron/",
				logo: "https://docs.theholocron.dev/holocron/logos/profile.v2.jpeg",
				favicon: "https://docs.theholocron.dev/holocron/favicon.svg",
				link: "https://docs.theholocron.dev/holocron/",
				automation: false,
				components: [
					{ name: "Sentinel", tags: ["sentinel"] },
					{ name: "Comlink", tags: ["comlink"] },
					{ name: "Docs", tags: ["docs"] },
				],
			},
		];
		const dns = expectedProviders.dns as { tuple: { options: Record<string, unknown> } };
		expect(dns.tuple.options).toEqual({});
		dns.tuple.options = { zone: "theholocron.dev" };
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

		// And (#2172): the `tooling` provider, Bruno over the apps' request files, so `export requests` runs from the root.
		expect(expectedProviders.tooling).toBeUndefined();
		expectedProviders.tooling = {
			cardinality: "many",
			tuples: [
				{
					provider: "bruno",
					packageName: "@theholocron/holocron-plugin-bruno",
					options: {
						workspaceName: "The Holocron",
						// And (#2322): the secret variables and the 1Password entries `holocron open requests` fills them from.
						secretRefs: { webhookSecret: "SENTINEL_WEBHOOK_SECRET", sentrySecret: "COMLINK_SENTRY_SECRET" },
						environmentLayers: {
							"Sentinel (local)": "local",
							"Sentinel (dev)": "dev",
							"Sentinel (prod)": "prod",
							"Comlink (local)": "prod",
						},
						collectionFiles: [
							"apps/sentinel/api/webhook.collection.json",
							"apps/comlink/src/worker.collection.json",
						],
						envFiles: [
							"apps/sentinel/api/webhook.environment.json",
							"apps/sentinel/api/webhook.environment.dev.json",
							"apps/sentinel/api/webhook.environment.prod.json",
							"apps/comlink/src/worker.environment.json",
						],
					},
				},
			],
		};

		// And (#2167, #2168): the `coverage` provider (Codecov, from `docsPreset()` since #2248, so the config has no line
		// of its own for it) and the `cache` provider (Turbo's remote cache), so `probe codecov token`,
		// `probe turbo token` and `doctor tokens` find their plugins.
		expect(expectedProviders.coverage).toBeUndefined();
		expect(expectedProviders.cache).toBeUndefined();
		expectedProviders.coverage = {
			cardinality: "single",
			tuple: { provider: "codecov", packageName: "@theholocron/holocron-plugin-codecov", options: {} },
		};
		expectedProviders.cache = {
			cardinality: "single",
			tuple: { provider: "turbo", packageName: "@theholocron/holocron-plugin-turbo", options: {} },
		};

		// And (#1851): the registered GitHub App instances `doctor github-app` checks.
		(expected as unknown as { githubApps: unknown }).githubApps = [
			{
				name: "Sentinel - dev",
				app: "Sentinel",
				label: "Dev",
				manifest: "apps/sentinel/github-app.manifest.json",
				environment: `${SLUG} - dev`,
			},
			{
				name: "Sentinel",
				app: "Sentinel",
				label: "Prod",
				manifest: "apps/sentinel/github-app.manifest.json",
				environment: `${SLUG} - prod`,
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
			"HOLOCRON_OP_SERVICE_ACCOUNT_TOKEN",
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
		];

		// And (#2183): the strays of the `dev` layer, which nothing syncs, are set by hand on purpose.
		(doctorBefore as { manualSecrets?: string[] }).manualSecrets = [
			"COMLINK_AXIOM_DATASET",
			"HOLOCRON_CHECKLY_DASHBOARD_KEY", // And (#2302): the private dashboard's view key.
			"HOLOCRON_ENVIRONMENT",
			"HOLOCRON_LINEAR_TOKEN",
			"HOLOCRON_OP_SERVICE_ACCOUNT_TOKEN",
			"HOLOCRON_POSTMAN_TOKEN",
			"SENTINEL_AXIOM_INGEST_TOKEN",
			"SENTINEL_GITHUB_APP_PRIVATE_KEY",
			"SENTINEL_REPO",
			"SENTINEL_VERCEL_PROJECT",
			"SENTINEL_WEBHOOK_SECRET",
		];

		// And (#2263): the five tasks whose checks Sentinel posts are marked, so they have no Actions workflow.
		markSentinelTasks(expected as unknown as { tasks: { name?: string; sentinel?: boolean }[] }, [
			"lint:editorconfig",
			"lint:markdown",
			"lint:commits",
			"validate:specs",
			"validate:docs",
		]);

		// And: the `annotate` task is gone from this repo's list. The gates annotate the diff themselves (problem matchers
		// in `lint:code`), so the second ReviewDog run is not needed.
		const expectedTasks = (expected as unknown as { tasks: unknown[] }).tasks;
		expectedTasks.splice(0, expectedTasks.length, ...expectedTasks.filter((task) => task !== "annotate"));

		// And (#2366): the `sync-incidents` task follows `reconcile-projects` in the list.
		expectedTasks.splice(expectedTasks.indexOf("reconcile-projects") + 1, 0, "sync-incidents");

		// And (#2591): the manual `open-incident` task follows `sync-incidents`.
		expectedTasks.splice(expectedTasks.indexOf("sync-incidents") + 1, 0, "open-incident");

		// And (#374): the agent carries the destructive command guard option, `["claude", { dcg: true }]`; its name is still
		// "claude", and the option is kept beside it.
		expect((expected as { agentOptions?: unknown }).agentOptions).toBeUndefined();
		(expected as { agentOptions?: unknown }).agentOptions = { dcg: true };

		const { resolved } = await loadConfig(REPO_ROOT, { gitExec });
		// And (#2430): the area labels are new since the snapshot. Check they are declared, then compare the rest.
		expect(Object.keys(resolved.repo?.labels?.areas ?? {})).toContain("cli");
		(expected as { repo: { labels?: unknown } }).repo.labels = resolved.repo?.labels;
		// And (#2512): the organization's five issue Types are new since the snapshot (the declaration in
		// `.holocron/org.ts`, placed into `config.issueTypes`; `load-config-issue-types.test.ts` checks them).
		expect((expected as { issueTypes?: unknown }).issueTypes).toBeUndefined();
		expect(resolved.issueTypes).toHaveLength(5);
		(expected as { issueTypes?: unknown }).issueTypes = resolved.issueTypes;
		// And (#2636): the repo drops the `ci` aggregate and writes its required checks down (`repo.requiredChecks`, in
		// `.holocron/repo.ts`); `root-required-checks.test.ts` pins the list.
		expect((expected as { ci?: unknown }).ci).toBeUndefined();
		expect(resolved.ci).toEqual({ aggregate: "none" });
		(expected as { ci?: unknown }).ci = resolved.ci;
		expect(resolved.repo?.requiredChecks).toContain("validate:dco / Run Developer Certificate of Origin");
		(expected as { repo: { requiredChecks?: unknown } }).repo.requiredChecks = resolved.repo?.requiredChecks;
		expect(normalise(resolved)).toEqual(expected);
	});
});
