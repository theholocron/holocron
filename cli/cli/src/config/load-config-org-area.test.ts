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

	it("resolves Sentinel's config to exactly what it was before the move", async () => {
		const expected = JSON.parse(await readFile(SNAPSHOT, "utf8")) as { providers: Record<string, unknown> };
		// The one deliberate difference (#1827): the Cloudflare `accountId` is no longer a literal but comes from the
		// credential chain, so `tunnels` carries no options and the Environment that holds it is a `credentials` entry.
		const { tuple } = expected.providers.tunnels as { tuple: { options: Record<string, unknown> } };
		expect(tuple.options).toEqual({ accountId: expect.any(String) });
		tuple.options = {};
		expected.providers.credentials = {
			cardinality: "many",
			tuples: [
				{
					provider: "1password",
					packageName: "@theholocron/holocron-plugin-1password",
					options: { environment: "Holocron - GitHub Actions variables" },
				},
			],
		};
		const { resolved } = await loadConfig(SENTINEL);
		expect(JSON.parse(JSON.stringify(resolved))).toEqual(expected);
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
});
