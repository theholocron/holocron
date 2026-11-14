import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../../config-system.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../../../", import.meta.url));
const SENTINEL = fileURLToPath(new URL("../../../../../../apps/sentinel/", import.meta.url));
const SENTINEL_CONFIG = new URL("../../../../../../apps/sentinel/holocron.config.ts", import.meta.url);

/**
 * Sentinel's fully resolved config as it was before #1820 moved the Vercel `teamId` and the Checkly `accountId` out of
 * `apps/sentinel/holocron.config.ts` into `apps/sentinel/.holocron/org.ts` (produced by the loader on the unmoved config).
 */
/** The remote the layers are derived from (#2069); the real checkout's `origin` is never read. */
const gitExec = async () => "https://github.com/theholocron/holocron.git";
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
			await import(
				/* @vite-ignore */ new URL("../../../../../../apps/sentinel/.holocron/org.ts", import.meta.url).href
			)
		).default as Record<string, unknown>;
		const shared = (
			await import(/* @vite-ignore */ new URL("../../../../../../.holocron/org.ts", import.meta.url).href)
		).default as Record<string, unknown>;
		expect(Object.keys(own)).toEqual(["vercel"]);
		expect(shared).toHaveProperty("checkly");
		const { resolved } = await loadConfig(SENTINEL, { gitExec });
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
		// And (#2063): the two literal Environments are one entry with none; the names are derived from the remote.
		expected.providers.credentials = {
			cardinality: "many",
			tuples: [{ provider: "1password", packageName: "@theholocron/holocron-plugin-1password", options: {} }],
		};
		// And (#2069): the vault and `dev` name a layer, so their Environment is derived: `prod` and `dev`.
		const vault = expected.providers.vault as { tuple: { options: Record<string, unknown> } };
		expect(vault.tuple.options).toEqual({ environment: "Sentinel" });
		vault.tuple.options = { environment: "theholocron/holocron - prod" };
		const devBlock = (expected as unknown as { dev: { environment: string } }).dev;
		expect(devBlock.environment).toBe("Sentinel - dev");
		devBlock.environment = "theholocron/holocron - dev";
		// Another (#1874): Sentinel's logger reads its Axiom dataset from `SENTINEL_AXIOM_DATASET`, the per-service name,
		// instead of the bare `AXIOM_DATASET`.
		const { logging, required } = (
			expected as unknown as { dev: { serve: { logging: { datasetVar: string }; required: string[] } } }
		).dev.serve;
		expect(logging.datasetVar).toBe("AXIOM_DATASET");
		logging.datasetVar = "SENTINEL_AXIOM_DATASET";
		// And another (#1864): the App's id and key are `SENTINEL_GITHUB_APP_ID` and `SENTINEL_GITHUB_APP_PRIVATE_KEY`,
		// GitHub reserving the `GITHUB_` prefix for its own secrets.
		expect(required).toEqual(["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "SENTINEL_WEBHOOK_SECRET"]);
		required.splice(0, 2, "SENTINEL_GITHUB_APP_ID", "SENTINEL_GITHUB_APP_PRIVATE_KEY");
		const { resolved } = await loadConfig(SENTINEL, { gitExec });
		// And the deployment key filter (#2061): `repo.secrets.deploy` says which keys the Vercel sync may send.
		expect(resolved.repo?.secrets?.deploy).toEqual([
			{
				environment: "theholocron/holocron - prod",
				prefix: "SENTINEL_",
				keys: ["HOLOCRON_AXIOM_ORG", "HOLOCRON_DISCORD_BOT_TOKEN", "HOLOCRON_USER_SYNC_TOKEN"],
			},
		]);
		delete resolved.repo;
		// And the Postman collection (#2172): Sentinel's `tooling` provider pushes its collection and environment to
		// the shared `Holocron` workspace, which did not exist before the move.
		const providers = resolved.providers as unknown as Record<string, unknown>;
		expect(providers.tooling).toEqual({
			cardinality: "many",
			tuples: [
				{
					provider: "postman",
					packageName: "@theholocron/holocron-plugin-postman",
					options: {
						workspace: "Holocron",
						collectionFiles: ["requests/collection.json"],
						envFiles: ["requests/environment.json"],
					},
				},
			],
		});
		delete providers.tooling;
		// The other deliberate difference (#1727): the loader sets `domain` from the shared root org area, so Sentinel's
		// resolved config now carries the org's zone, which it did not before.
		expect(resolved.domain).toBe("theholocron.dev");
		expect(JSON.parse(JSON.stringify({ ...resolved, domain: undefined }))).toEqual(expected);
	});

	it("spells the zone once, in the root area, and every config and area file gets it from there (#1727)", async () => {
		const shared = (
			await import(/* @vite-ignore */ new URL("../../../../../../.holocron/org.ts", import.meta.url).href)
		).default as { domain: string };
		const own = (
			await import(
				/* @vite-ignore */ new URL("../../../../../../apps/sentinel/.holocron/org.ts", import.meta.url).href
			)
		).default as Record<string, unknown>;
		expect(shared.domain).toBe("theholocron.dev");
		expect(own).not.toHaveProperty("domain");
		const root = await loadConfig(REPO_ROOT, { gitExec });
		expect(root.resolved.domain).toBe(shared.domain);
		const wiki = root.resolved.providers.wiki as unknown as { tuple: { options: { domain: string } } };
		expect(wiki.tuple.options.domain).toBe(`wiki.${shared.domain}`);
		const raw = (
			await import(/* @vite-ignore */ new URL("../../../../../../holocron.config.ts", import.meta.url).href)
		).default as Record<string, unknown>;
		expect(raw).not.toHaveProperty("domain");
		const sentinel = await loadConfig(SENTINEL, { gitExec });
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
		const { resolved } = await loadConfig(REPO_ROOT, { gitExec });
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
		const raw = (
			await import(/* @vite-ignore */ new URL("../../../../../../holocron.config.ts", import.meta.url).href)
		).default as { providers: { errors: unknown } };
		expect(raw.providers.errors).toBe("sentry");
		const { resolved } = await loadConfig(REPO_ROOT, { gitExec });
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
