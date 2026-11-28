import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigError } from "../config/index.js";
import { loadConfig } from "../config-system.js";

/** The org area is shared with configs in subdirectories (#1829); the other areas are not. */
describe("loadConfig with the repository root's .holocron/ shared (#1829)", () => {
	let root: string;
	let app: string;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "holocron-shared-"));
		await mkdir(join(root, ".git"));
		app = join(root, "apps", "demo");
		await mkdir(join(app, ".holocron"), { recursive: true });
		await mkdir(join(root, ".holocron"), { recursive: true });
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const appConfig = (providers: Record<string, unknown>) =>
		writeFile(
			join(app, "holocron.config.json"),
			JSON.stringify({ name: "demo", providers: { source: "github", ...providers } })
		);
	const rootArea = (file: string, value: unknown) => writeFile(join(root, ".holocron", file), JSON.stringify(value));
	const appArea = (file: string, value: unknown) => writeFile(join(app, ".holocron", file), JSON.stringify(value));
	const optionsOf = async (key: string) => {
		const entry = (await loadConfig(app)).resolved.providers[key as "monitoring"];
		return (entry as { tuple: { options: unknown } }).tuple.options;
	};

	it("fills an app's provider from the root's org area when the app has none", async () => {
		await appConfig({ monitoring: "checkly" });
		await rootArea("org.json", { checkly: { accountId: "root" } });
		expect(await optionsOf("monitoring")).toEqual({ accountId: "root" });
	});

	it("takes the app's value for a key set in both, and the root's for the keys only it sets", async () => {
		await appConfig({ monitoring: "checkly", deployment: "vercel" });
		await rootArea("org.json", { checkly: { accountId: "root" }, vercel: { teamId: "root-team" } });
		await appArea("org.json", { vercel: { teamId: "app-team" } });
		expect(await optionsOf("deployment")).toEqual({ teamId: "app-team" });
		expect(await optionsOf("monitoring")).toEqual({ accountId: "root" });
	});

	it("still errors when an option is set inline and in the root's area", async () => {
		await appConfig({ monitoring: ["checkly", { accountId: "inline" }] });
		await rootArea("org.json", { checkly: { accountId: "root" } });
		const err = await loadConfig(app).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(
			/checkly\.accountId is set in providers\.monitoring and in \.\.\/\.\.\/\.holocron\/org\.json/
		);
	});

	it("does not read the root's repo or notifications areas for an app", async () => {
		await appConfig({});
		await rootArea("repo.json", { topics: ["root"] });
		await rootArea("notifications.json", { relay: {} });
		const { resolved } = await loadConfig(app);
		expect(resolved.repo?.topics).toBeUndefined();
		expect(resolved.providers.notifications).toBeUndefined();
	});

	it("is unchanged for a config at the repository root", async () => {
		await writeFile(
			join(root, "holocron.config.json"),
			JSON.stringify({ name: "demo", providers: { source: "github", monitoring: "checkly" } })
		);
		await rootArea("org.json", { checkly: { accountId: "root" } });
		const { resolved } = await loadConfig(root);
		expect((resolved.providers.monitoring as { tuple: { options: unknown } }).tuple.options).toEqual({
			accountId: "root",
		});
	});
});
