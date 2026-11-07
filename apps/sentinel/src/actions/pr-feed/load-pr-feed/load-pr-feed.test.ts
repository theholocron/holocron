import type { GitHubClient } from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import type { RoleNotifications } from "../../role-sync/index.js";
import { loadPrFeed } from "./load-pr-feed.js";
import type { PrFeedEnv, PrFeedFactories } from "./load-pr-feed.type.js";

const CLIENT = {} as GitHubClient;
const ENV: PrFeedEnv = { SENTINEL_ROLE_SYNC_REPO: "acme/holocron", HOLOCRON_DISCORD_BOT_TOKEN: "bot" };
const LAYOUT = { categories: [{ name: "Dev", channels: [{ name: "prs", kind: "forum", feeds: { prs: true } }] }] };

function factories(providers: unknown, layout: unknown = LAYOUT, status = "valid"): PrFeedFactories {
	return {
		validateConfig: vi.fn(async () =>
			status === "valid"
				? { status: "valid" as const, filepath: "holocron.config.ts", config: { providers } as never }
				: ({ status } as never)
		),
		createNotifications: vi.fn(() => ({ layout }) as unknown as RoleNotifications),
	};
}

const DISCORD = { notifications: ["discord", { guildId: "1" }] };
const load = (env: PrFeedEnv, f: PrFeedFactories, org = "acme") =>
	loadPrFeed({ client: CLIENT, env, org, factories: f });

describe("loadPrFeed", () => {
	it("builds the provider from the configured repo and finds the forum", async () => {
		const f = factories(DISCORD);
		const result = await load(ENV, f);
		expect(result).toMatchObject({ ok: true, channel: { name: "prs", excludeRepos: [], excludeAuthors: [] } });
		expect(f.validateConfig).toHaveBeenCalledWith({ client: CLIENT, repo: "acme/holocron" });
		expect(f.createNotifications).toHaveBeenCalledWith({ guildId: "1" }, "bot");
	});

	it("is off, saying which setting is missing", async () => {
		const f = factories(DISCORD);
		expect(await load({ ...ENV, SENTINEL_ROLE_SYNC_REPO: undefined }, f)).toMatchObject({
			ok: false,
			reason: expect.stringContaining("SENTINEL_ROLE_SYNC_REPO"),
		});
		expect(await load({ ...ENV, HOLOCRON_DISCORD_BOT_TOKEN: undefined }, f)).toMatchObject({
			ok: false,
			reason: expect.stringContaining("HOLOCRON_DISCORD_BOT_TOKEN"),
		});
		expect(f.validateConfig).not.toHaveBeenCalled();
	});

	it("uses the real providers unless given others, and is off without the settings", async () => {
		expect(await loadPrFeed({ client: CLIENT, env: {}, org: "acme" })).toMatchObject({ ok: false });
	});

	it("does nothing for another organisation", async () => {
		const f = factories(DISCORD);
		expect(await load(ENV, f, "other")).toMatchObject({
			ok: false,
			reason: expect.stringContaining("not for the other"),
		});
		expect(f.validateConfig).not.toHaveBeenCalled();
	});

	it("says so when the config does not load, has no discord provider or has no feed forum", async () => {
		expect(await load(ENV, factories(DISCORD, LAYOUT, "no-config"))).toEqual({
			ok: false,
			reason: "acme/holocron has no usable holocron config (no-config)",
		});
		expect(await load(ENV, factories({}))).toMatchObject({
			ok: false,
			reason: expect.stringMatching(/no notifications/),
		});
		expect(await load(ENV, factories(DISCORD, {}))).toEqual({
			ok: false,
			reason: "acme/holocron's layout has no forum with feeds.prs",
		});
	});
});
