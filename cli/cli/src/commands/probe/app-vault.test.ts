import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PluginImporter } from "../../plugin/index.js";
import { loadAppVault } from "./app-vault.js";

describe("loadAppVault", () => {
	let root: string;
	beforeEach(async () => void (root = await mkdtemp(join(tmpdir(), "app-vault-"))));
	afterEach(() => rm(root, { recursive: true, force: true }));

	const vaultPlugin = {
		createPlugin: () => ({ name: "demo", capabilities: { vault: () => ({ key: "vault", providerName: "demo" }) } }),
	};
	const importer = (async () => vaultPlugin) as unknown as PluginImporter;
	const writeApp = async (config: object) => {
		const dir = join(root, "apps", "relay");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "holocron.config.json"), JSON.stringify(config));
		return dir;
	};

	it("gives the vault an app's own config declares", async () => {
		const dir = await writeApp({ name: "relay", providers: { vault: "demo" } });
		const vault = await loadAppVault(dir, { repoRoot: root }, importer);
		expect(vault).toMatchObject({ key: "vault", providerName: "demo" });
	});

	it("is undefined when the app's config declares no vault", async () => {
		const dir = await writeApp({ name: "relay", providers: {} });
		expect(await loadAppVault(dir, { repoRoot: root }, importer)).toBeUndefined();
	});

	it("is undefined when the vault's plugin cannot be loaded", async () => {
		const dir = await writeApp({ name: "relay", providers: { vault: "demo" } });
		const missing = (async () => {
			throw new Error("Cannot find package");
		}) as unknown as PluginImporter;
		expect(await loadAppVault(dir, { repoRoot: root }, missing)).toBeUndefined();
	});

	it("does not mistake the repo's config, found by walking up, for the app's", async () => {
		await writeFile(
			join(root, "holocron.config.json"),
			JSON.stringify({ name: "root", providers: { vault: "demo" } })
		);
		const dir = join(root, "apps", "relay");
		await mkdir(dir, { recursive: true });
		expect(await loadAppVault(dir, { repoRoot: root }, importer)).toBeUndefined();
	});

	it("is undefined when the app's config cannot be read", async () => {
		const dir = await writeApp({});
		await writeFile(join(dir, "holocron.config.json"), "{ nope");
		expect(await loadAppVault(dir, { repoRoot: root }, importer)).toBeUndefined();
	});
});
