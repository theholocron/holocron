import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadConfig } from "./config-system.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SENTINEL = fileURLToPath(new URL("../../../../apps/sentinel/", import.meta.url));
const SENTINEL_CONFIG = new URL("../../../../apps/sentinel/holocron.config.ts", import.meta.url);

/**
 * Sentinel's fully resolved config as it was before #1820 moved the Vercel `teamId` and the Checkly `accountId` out of
 * `apps/sentinel/holocron.config.ts` into `apps/sentinel/.holocron/org.ts` (produced by the loader on the unmoved config).
 */
const SNAPSHOT = new URL("./sentinel-org-area.pre-move.snapshot.json", import.meta.url);

type RawConfig = {
	providers: { deployment: [string, Record<string, unknown>]; monitoring: [string, Record<string, unknown>] };
};

describe("the org area in this repo (#1820)", () => {
	it("keeps the org identifiers out of apps/sentinel/holocron.config.ts", async () => {
		const raw = (await import(/* @vite-ignore */ SENTINEL_CONFIG.href)).default as RawConfig;
		expect(raw.providers.deployment[1]).not.toHaveProperty("teamId");
		expect(raw.providers.monitoring[1]).not.toHaveProperty("accountId");
		expect(raw.providers.deployment[1]).toHaveProperty("domain", "sentinel.theholocron.dev");
	});

	it("holds the Checkly accountId once, in the root area, and Sentinel still gets it (#1829)", async () => {
		const own = (
			await import(/* @vite-ignore */ new URL("../../../../apps/sentinel/.holocron/org.ts", import.meta.url).href)
		).default as Record<string, unknown>;
		const shared = (await import(/* @vite-ignore */ new URL("../../../../.holocron/org.ts", import.meta.url).href))
			.default as Record<string, unknown>;
		expect(Object.keys(own)).toEqual(["vercel"]);
		expect(shared).toHaveProperty("checkly");
		const { resolved } = await loadConfig(SENTINEL);
		const monitoring = resolved.providers.monitoring as { tuple: { options: { accountId?: string } } };
		expect(monitoring.tuple.options.accountId).toBe((shared.checkly as { accountId: string }).accountId);
	});

	it("resolves Sentinel's config to exactly what it was before the move", async () => {
		const expected = JSON.parse(await readFile(SNAPSHOT, "utf8")) as { providers: Record<string, unknown> };
		// The one deliberate difference (#1827): the Cloudflare `accountId` is no longer a literal but comes from the
		// credential chain, so `tunnels` carries no options and the Environment that holds it is a `credentials` entry.
		// And the machine's own tokens: Sentinel reads the `Holocron` Environment first, as the root config does, so a
		// command run from here (`holocron dev`) finds the Cloudflare token before the keyring.
		const { tuple } = expected.providers.tunnels as { tuple: { options: Record<string, unknown> } };
		expect(tuple.options).toEqual({ accountId: expect.any(String) });
		tuple.options = {};
		expected.providers.credentials = {
			cardinality: "many",
			tuples: [
				{
					provider: "1password",
					packageName: "@theholocron/holocron-plugin-1password",
					options: { environment: "Holocron" },
				},
				{
					provider: "1password",
					packageName: "@theholocron/holocron-plugin-1password",
					options: { environment: "Holocron - GitHub Actions variables" },
				},
			],
		};
		const { resolved } = await loadConfig(SENTINEL);
		// The other deliberate difference (#1727): the loader sets `domain` from the shared root org area, so Sentinel's
		// resolved config now carries the org's zone, which it did not before.
		expect(resolved.domain).toBe("theholocron.dev");
		expect(JSON.parse(JSON.stringify({ ...resolved, domain: undefined }))).toEqual(expected);
	});

	it("spells the zone once, in the root area, and every config and area file gets it from there (#1727)", async () => {
		const shared = (await import(/* @vite-ignore */ new URL("../../../../.holocron/org.ts", import.meta.url).href))
			.default as { domain: string };
		const own = (
			await import(/* @vite-ignore */ new URL("../../../../apps/sentinel/.holocron/org.ts", import.meta.url).href)
		).default as Record<string, unknown>;
		expect(shared.domain).toBe("theholocron.dev");
		expect(own).not.toHaveProperty("domain");
		const root = await loadConfig(REPO_ROOT);
		expect(root.resolved.domain).toBe(shared.domain);
		const wiki = root.resolved.providers.wiki as unknown as { tuple: { options: { domain: string } } };
		expect(wiki.tuple.options.domain).toBe(`wiki.${shared.domain}`);
		const raw = (await import(/* @vite-ignore */ new URL("../../../../holocron.config.ts", import.meta.url).href))
			.default as Record<string, unknown>;
		expect(raw).not.toHaveProperty("domain");
		const sentinel = await loadConfig(SENTINEL);
		expect(sentinel.resolved.domain).toBe(shared.domain);
		const dev = sentinel.resolved.dev as { tunnel: { hostname: string } };
		expect(dev.tunnel.hostname).toBe(`sentinel-dev.${shared.domain}`);
		const notifications = root.resolved.providers.notifications as unknown as {
			tuples: { options: { layout: { relay: { host: string }; links: { hostedUrl: string } } } }[];
		};
		const layout = notifications.tuples[0]!.options.layout;
		expect(layout.relay.host).toBe(`comlink.${shared.domain}`);
		expect(layout.links.hostedUrl).toBe(`https://sentinel.${shared.domain}`);
	});

	it("resolves the root config's Checkly entry to what it was before the move", async () => {
		const { resolved } = await loadConfig(REPO_ROOT);
		expect(resolved.providers.monitoring).toEqual({
			cardinality: "single",
			tuple: {
				provider: "checkly",
				packageName: "@theholocron/holocron-plugin-checkly",
				options: { accountId: "fb82859a-4f62-4773-8404-db0f29f9262c" },
			},
		});
	});

	it("fills the Sentry org slug into the root config's errors entry from the area, not inline (#1727)", async () => {
		const raw = (await import(/* @vite-ignore */ new URL("../../../../holocron.config.ts", import.meta.url).href))
			.default as { providers: { errors: unknown } };
		expect(raw.providers.errors).toBe("sentry");
		const { resolved } = await loadConfig(REPO_ROOT);
		expect(resolved.providers.errors).toEqual({
			cardinality: "single",
			tuple: {
				provider: "sentry",
				packageName: expect.any(String),
				options: { org: "theholocron" },
			},
		});
	});
});
