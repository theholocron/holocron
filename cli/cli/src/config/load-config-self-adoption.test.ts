import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { NotificationsLayout } from "../plugin/index.js";
import { loadConfig } from "./config-system.js";

/** This repository's root: its own real `holocron.config.ts` and `.holocron/` are loaded, not a copy. */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const CONFIG_URL = new URL("../../../../holocron.config.ts", import.meta.url);

/**
 * The fully resolved config as it was before #1747 moved anything (commit `e7fca267c`), produced by running the loader
 * on that commit's `holocron.config.ts` in a scratch directory. Two things in it are not stable across checkouts, so
 * they are normalised on both sides: `repo.name` (read from the git remote, absent without one) and the `test:unit`
 * task's `with.uploads` (one Codecov upload per workspace package, so it changes whenever a package is added).
 */
const SNAPSHOT = new URL("./holocron-self-adoption.pre-move.snapshot.json", import.meta.url);
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
		const { resolved } = await loadConfig(REPO_ROOT);
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
		// And (#1822): the ideas forum gained a default reaction and starter reactions.
		const ideas = (options.layout?.categories ?? [])
			.flatMap((c) => c.channels ?? [])
			.find((c) => c.name === "ideas");
		expect(ideas?.defaultReaction).toBeUndefined();
		Object.assign(ideas!, { defaultReaction: "👍", starterReactions: ["👍", "👎", "❓"] });
		// And (#1817): the three organization variables are no longer literals but come from a 1Password Environment.
		const repoBefore = (expected as { repo: { variables?: unknown } }).repo;
		expect(repoBefore.variables).toEqual({
			org: { AXIOM_DATASET: "holocron-ci", CLOUDFLARE_ACCOUNT_ID: expect.any(String), TURBO_TEAM: "iamnewton" },
		});
		repoBefore.variables = {
			sync: [
				{
					environment: "Holocron - GitHub Actions variables",
					scope: "org=theholocron",
					keys: [
						"AXIOM_DATASET",
						"CLOUDFLARE_ACCOUNT_ID",
						"CLOUDFLARE_PAGES_PROJECT",
						"POSTHOG_PROJECT_TOKEN",
						"SENTRY_ORG",
						"TURBO_TEAM",
					],
				},
			],
		};
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
		tuples.push({
			provider: "1password",
			packageName: "@theholocron/holocron-plugin-1password",
			options: { environment: "Holocron - GitHub Actions variables" },
		});

		const { resolved } = await loadConfig(REPO_ROOT);
		expect(normalise(resolved)).toEqual(expected);
	});
});
