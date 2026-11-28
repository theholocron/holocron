import { ConfigError } from "@theholocron/kyber/config";
import { describe, expect, it, vi } from "vitest";

import type { ResolvedHolocronConfig } from "../config/index.js";
import { resolveLayers } from "./resolve-layers.js";

const gitExec = async () => "git@github.com:theholocron/holocron.git\n";
const slug = "theholocron/holocron";

const base: ResolvedHolocronConfig = {
	name: "x",
	providers: {},
	apps: [],
	doctor: {},
} as unknown as ResolvedHolocronConfig;

const run = (config: Partial<ResolvedHolocronConfig>, exec = gitExec) =>
	resolveLayers({ ...base, ...config }, { repoRoot: "/r", gitExec: exec });

describe("resolveLayers", () => {
	it("returns a config with no layer unchanged, and never reads the remote", async () => {
		const exec = vi.fn(gitExec);
		const config = {
			...base,
			repo: {
				secrets: { sync: [{ environment: "Mine" }], deploy: [{ environment: "Mine", prefix: "A_" }] },
				variables: { sync: [{ environment: "Mine", keys: ["A"] }] },
			},
			githubApps: [{ name: "n", manifest: "m", environment: "Mine" }],
			dev: { environment: "Mine" },
		} as ResolvedHolocronConfig;
		expect(await resolveLayers(config, { repoRoot: "/r", gitExec: exec })).toEqual(config);
		expect(exec).not.toHaveBeenCalled();
	});

	it("derives the Environment of each repo.secrets.sync, repo.secrets.deploy and repo.variables.sync entry", async () => {
		const out = await run({
			repo: {
				secrets: {
					sync: [{ layer: "ci", scope: "org=o" }],
					deploy: [{ layer: "prod", prefix: "SENTINEL_" }],
				},
				variables: { sync: [{ layer: "ci", keys: ["A"] }] },
			},
		} as never);
		expect(out.repo?.secrets?.sync).toEqual([{ environment: `${slug} - ci`, scope: "org=o" }]);
		expect(out.repo?.secrets?.deploy).toEqual([{ environment: `${slug} - prod`, prefix: "SENTINEL_" }]);
		expect(out.repo?.variables?.sync).toEqual([{ environment: `${slug} - ci`, keys: ["A"] }]);
	});

	it("keeps the other keys of repo, secrets and variables", async () => {
		const out = await run({
			repo: {
				defaultBranch: "alpha",
				secrets: { repo: ["A"], sync: [{ layer: "ci" }] },
				variables: { repo: { V: "1" }, sync: [{ layer: "ci", keys: ["A"] }] },
			},
		} as never);
		expect(out.repo).toMatchObject({
			defaultBranch: "alpha",
			secrets: { repo: ["A"] },
			variables: { repo: { V: "1" } },
		});
	});

	it("leaves a repo with only secrets, or only variables, as it is shaped", async () => {
		const onlySecrets = await run({ repo: { secrets: { deploy: [{ layer: "prod", keys: ["K"] }] } } } as never);
		expect(onlySecrets.repo).toEqual({ secrets: { deploy: [{ environment: `${slug} - prod`, keys: ["K"] }] } });
		const noSync = await run({ repo: { variables: { repo: { V: "1" } } } } as never);
		expect(noSync.repo).toEqual({ variables: { repo: { V: "1" } } });
	});

	it("derives githubApps and dev", async () => {
		const out = await run({
			githubApps: [
				{ name: "Sentinel", manifest: "m", layer: "prod" },
				{ name: "Sentinel - dev", manifest: "m", layer: "dev" },
			],
			dev: { layer: "dev", port: 3000 },
		} as never);
		expect(out.githubApps?.map((app) => app.environment)).toEqual([`${slug} - prod`, `${slug} - dev`]);
		expect(out.githubApps?.[0]).not.toHaveProperty("layer");
		expect(out.dev).toEqual({ environment: `${slug} - dev`, port: 3000 });
	});

	it("derives the vault provider's layer option into its environment option", async () => {
		const out = await run({
			providers: {
				vault: {
					cardinality: "single",
					tuple: { provider: "1password", packageName: "p", options: { layer: "prod", other: 1 } },
				},
			},
		});
		expect(out.providers.vault).toEqual({
			cardinality: "single",
			tuple: { provider: "1password", packageName: "p", options: { other: 1, environment: `${slug} - prod` } },
		});
	});

	it("leaves a vault provider with no layer, or a list of providers, alone", async () => {
		const single = {
			cardinality: "single",
			tuple: { provider: "1password", packageName: "p", options: { environment: "Mine" } },
		} as const;
		expect((await run({ providers: { vault: single } })).providers.vault).toBe(single);
		const many = { cardinality: "many", tuples: [] } as const;
		expect((await run({ providers: { vault: many as never } })).providers.vault).toBe(many);
	});

	it("reads the remote once for any number of layers", async () => {
		const exec = vi.fn(gitExec);
		await run({ githubApps: [{ name: "a", manifest: "m", layer: "dev" }], dev: { layer: "dev" } } as never, exec);
		expect(exec).toHaveBeenCalledTimes(1);
	});

	it("does not change the config it was given", async () => {
		const config = { ...base, dev: { layer: "dev" } } as ResolvedHolocronConfig;
		await resolveLayers(config, { repoRoot: "/r", gitExec });
		expect(config.dev).toEqual({ layer: "dev" });
	});

	it("is a ConfigError naming the environment option when the remote cannot be derived", async () => {
		const err = await run({ dev: { layer: "dev" } } as never, async () => "").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/`environment` option/);
	});
});
