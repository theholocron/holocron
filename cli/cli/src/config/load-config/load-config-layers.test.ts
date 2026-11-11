import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigError } from "../config/index.js";
import { loadConfig } from "../config-system.js";

const gitExec = async () => "https://github.com/theholocron/holocron.git\n";

describe("loadConfig with layers (#2069)", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), "holocron-layers-"));
	});
	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	const write = (config: object) => writeFile(join(cwd, "holocron.config.json"), JSON.stringify(config));

	it("turns each layer into the Environment of this repository", async () => {
		await write({
			name: "demo",
			providers: { vault: ["1password", { layer: "ci" }], source: "github" },
			repo: { secrets: { sync: [{ layer: "ci" }] } },
			githubApps: [{ name: "Sentinel", manifest: "m.json", layer: "prod" }],
		});
		const { resolved } = await loadConfig(cwd, { gitExec });
		expect(resolved.repo?.secrets?.sync).toEqual([{ environment: "theholocron/holocron - ci" }]);
		expect(resolved.githubApps?.[0]?.environment).toBe("theholocron/holocron - prod");
		expect(resolved.providers.vault).toMatchObject({
			tuple: { options: { environment: "theholocron/holocron - ci" } },
		});
	});

	it("reads no remote for a config that names none", async () => {
		await write({ name: "demo", providers: { vault: "1password", source: "github" } });
		const { resolved } = await loadConfig(cwd, {
			gitExec: async () => {
				throw new Error("no remote should be read");
			},
		});
		expect(resolved.name).toBe("demo");
	});

	it("fails with a ConfigError naming the environment option when a layer has no remote", async () => {
		await write({ name: "demo", providers: { vault: "1password", source: "github" }, dev: { layer: "dev" } });
		const err = await loadConfig(cwd, { gitExec: async () => "" }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/`environment` option/);
	});

	it("rejects a layer and an environment on one entry", async () => {
		await write({
			name: "demo",
			providers: { vault: "1password", source: "github" },
			dev: { layer: "dev", environment: "E" },
		});
		await expect(loadConfig(cwd, { gitExec })).rejects.toThrow(/sets both/);
	});
});
