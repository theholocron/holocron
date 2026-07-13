import { describe, expect, it, vi } from "vitest";

import { cardinalityOf, LoaderError, PluginLoader, type PluginImporter } from "../loader.js";
import { resolveConfig } from "../config.js";

function loaderWith(rawConfig: Parameters<typeof resolveConfig>[0], modules: Record<string, unknown>) {
	const config = resolveConfig(rawConfig);
	const importer = vi.fn(async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg] as Awaited<ReturnType<PluginImporter>>;
	});
	const loader = new PluginLoader(
		config,
		{ repoRoot: "/tmp/test-repo", repo: "theholocron/holocron" },
		importer as PluginImporter
	);
	return { loader, importer };
}

// Sentinel impls — we just check identity in the registry.
function makePlugin(name: string, caps: Record<string, unknown>) {
	return {
		createPlugin: (_opts: Record<string, unknown>) => ({
			name,
			capabilities: Object.fromEntries(Object.entries(caps).map(([k, impl]) => [k, () => impl])),
		}),
	};
}

describe("PluginLoader — single cardinality", () => {
	it("loads a configured plugin and exposes its capability", async () => {
		const sourceImpl = { key: "source", providerName: "github" };
		const { loader } = loaderWith(
			{
				project: { name: "demo" },
				providers: { vault: "1password", source: "github" },
			},
			{
				"@theholocron/holocron-plugin-1password": makePlugin("1password", { vault: {} }),
				"@theholocron/holocron-plugin-github": makePlugin("github", { source: sourceImpl }),
			}
		);

		await loader.load();
		expect(loader.has("source")).toBe(true);
		expect(loader.get("source")).toBe(sourceImpl);
	});

	it("throws LoaderError when accessing a non-loaded capability", async () => {
		const { loader } = loaderWith(
			{ project: { name: "demo" }, providers: { vault: "1password" } },
			{ "@theholocron/holocron-plugin-1password": makePlugin("1password", { vault: {} }) }
		);
		await loader.load();
		expect(() => loader.get("source")).toThrow(LoaderError);
		expect(() => loader.get("source")).toThrow(/holocron\.config\.json/);
	});

	it("throws LoaderError when the package cannot be imported", async () => {
		const { loader } = loaderWith(
			{
				project: { name: "demo" },
				providers: { vault: "1password", source: "gitlab" },
			},
			{ "@theholocron/holocron-plugin-1password": makePlugin("1password", { vault: {} }) }
		);
		await expect(loader.load()).rejects.toThrow(/failed to import/);
	});

	it("throws when the package does not export createPlugin", async () => {
		const { loader } = loaderWith(
			{
				project: { name: "demo" },
				providers: { vault: "1password", source: "broken" },
			},
			{
				"@theholocron/holocron-plugin-1password": makePlugin("1password", { vault: {} }),
				"@theholocron/holocron-plugin-broken": { somethingElse: true },
			}
		);
		await expect(loader.load()).rejects.toThrow(/createPlugin/);
	});

	it("throws when the plugin does not implement the requested capability", async () => {
		const { loader } = loaderWith(
			{
				project: { name: "demo" },
				providers: { vault: "1password", source: "github" },
			},
			{
				"@theholocron/holocron-plugin-1password": makePlugin("1password", { vault: {} }),
				// GitHub plugin advertises issues but NOT source — should fail
				"@theholocron/holocron-plugin-github": makePlugin("github", { issues: {} }),
			}
		);
		await expect(loader.load()).rejects.toThrow(/does not implement the `source` capability/);
	});

	it("merges plugin tuple options with the runtime context", async () => {
		const captured: Record<string, unknown> = {};
		const { loader } = loaderWith(
			{
				project: { name: "demo" },
				providers: {
					vault: "1password",
					source: ["github", { repo: "theholocron/holocron" }],
				},
			},
			{
				"@theholocron/holocron-plugin-1password": makePlugin("1password", { vault: {} }),
				"@theholocron/holocron-plugin-github": {
					createPlugin: (opts: Record<string, unknown>) => {
						Object.assign(captured, opts);
						return { name: "github", capabilities: { source: () => ({}) } };
					},
				},
			}
		);
		await loader.load();
		// Options should include both the runtime context (repoRoot) and the
		// tuple-level options (repo).
		expect(captured.repoRoot).toBe("/tmp/test-repo");
		expect(captured.repo).toBe("theholocron/holocron");
	});

	it("propagates dryRun + cliToken from RuntimeContext to every plugin", async () => {
		const capturedAtVault: Record<string, unknown> = {};
		const capturedAtSource: Record<string, unknown> = {};
		const config = resolveConfig({
			project: { name: "demo" },
			providers: { vault: "1password", source: "github" },
		});
		const importer = vi.fn(async (pkg: string) => {
			if (pkg === "@theholocron/holocron-plugin-1password") {
				return {
					createPlugin: (opts: Record<string, unknown>) => {
						Object.assign(capturedAtVault, opts);
						return { name: "1p", capabilities: { vault: () => ({}) } };
					},
				};
			}
			return {
				createPlugin: (opts: Record<string, unknown>) => {
					Object.assign(capturedAtSource, opts);
					return { name: "gh", capabilities: { source: () => ({}) } };
				},
			};
		});
		const loader = new PluginLoader(
			config,
			{ repoRoot: "/tmp", dryRun: true, cliToken: "cli-pat-xxx" },
			importer as unknown as PluginImporter
		);
		await loader.load();
		expect(capturedAtVault.dryRun).toBe(true);
		expect(capturedAtVault.cliToken).toBe("cli-pat-xxx");
		expect(capturedAtSource.dryRun).toBe(true);
		expect(capturedAtSource.cliToken).toBe("cli-pat-xxx");
	});
});

describe("PluginLoader — project.repo defaults", () => {
	it("injects config.project.repo into plugin options when context.repo is absent", async () => {
		const captured: Record<string, unknown> = {};
		const config = resolveConfig({
			project: { name: "demo", repo: "acme/foo" },
			providers: { vault: "1password", source: "github" },
		});
		const importer = vi.fn(async (pkg: string) => {
			if (pkg === "@theholocron/holocron-plugin-1password") {
				return { createPlugin: () => ({ name: "1p", capabilities: { vault: () => ({}) } }) };
			}
			return {
				createPlugin: (opts: Record<string, unknown>) => {
					Object.assign(captured, opts);
					return { name: "gh", capabilities: { source: () => ({}) } };
				},
			};
		});
		const loader = new PluginLoader(config, { repoRoot: "/tmp" }, importer as unknown as PluginImporter);
		await loader.load();
		expect(captured.repo).toBe("acme/foo");
	});

	it("context.repo (CLI --repo flag) overrides config.project.repo", async () => {
		const captured: Record<string, unknown> = {};
		const config = resolveConfig({
			project: { name: "demo", repo: "acme/from-config" },
			providers: { vault: "1password", source: "github" },
		});
		const importer = vi.fn(async (pkg: string) => {
			if (pkg === "@theholocron/holocron-plugin-1password") {
				return { createPlugin: () => ({ name: "1p", capabilities: { vault: () => ({}) } }) };
			}
			return {
				createPlugin: (opts: Record<string, unknown>) => {
					Object.assign(captured, opts);
					return { name: "gh", capabilities: { source: () => ({}) } };
				},
			};
		});
		const loader = new PluginLoader(
			config,
			{ repoRoot: "/tmp", repo: "override/from-flag" },
			importer as unknown as PluginImporter
		);
		await loader.load();
		expect(captured.repo).toBe("override/from-flag");
	});

	it("per-plugin tuple options override both context and project defaults", async () => {
		const captured: Record<string, unknown> = {};
		const config = resolveConfig({
			project: { name: "demo", repo: "acme/from-config" },
			providers: {
				vault: "1password",
				source: ["github", { repo: "override/from-tuple" }],
			},
		});
		const importer = vi.fn(async (pkg: string) => {
			if (pkg === "@theholocron/holocron-plugin-1password") {
				return { createPlugin: () => ({ name: "1p", capabilities: { vault: () => ({}) } }) };
			}
			return {
				createPlugin: (opts: Record<string, unknown>) => {
					Object.assign(captured, opts);
					return { name: "gh", capabilities: { source: () => ({}) } };
				},
			};
		});
		const loader = new PluginLoader(
			config,
			{ repoRoot: "/tmp", repo: "override/from-flag" },
			importer as unknown as PluginImporter
		);
		await loader.load();
		// Precedence: tuple > context > project defaults.
		expect(captured.repo).toBe("override/from-tuple");
	});

	it("omits repo entirely when neither config nor context sets it (non-github configs)", async () => {
		const captured: Record<string, unknown> = {};
		const config = resolveConfig({
			project: { name: "demo" }, // no repo
			providers: { vault: "1password" },
		});
		const importer = vi.fn(async () => ({
			createPlugin: (opts: Record<string, unknown>) => {
				Object.assign(captured, opts);
				return { name: "1p", capabilities: { vault: () => ({}) } };
			},
		}));
		const loader = new PluginLoader(config, { repoRoot: "/tmp" }, importer as unknown as PluginImporter);
		await loader.load();
		expect(captured.repo).toBeUndefined();
	});
});

describe("PluginLoader — many cardinality", () => {
	it("loads N plugins for a multi-cardinality capability", async () => {
		const slackImpl = { key: "notifications", providerName: "slack" };
		const discordImpl = { key: "notifications", providerName: "discord" };
		const { loader } = loaderWith(
			{
				project: { name: "demo" },
				providers: {
					vault: "1password",
					notifications: ["slack", "discord"],
				},
			},
			{
				"@theholocron/holocron-plugin-1password": makePlugin("1password", { vault: {} }),
				"@theholocron/holocron-plugin-slack": makePlugin("slack", { notifications: slackImpl }),
				"@theholocron/holocron-plugin-discord": makePlugin("discord", {
					notifications: discordImpl,
				}),
			}
		);

		await loader.load();
		const impls = loader.get("notifications");
		expect(impls).toEqual([slackImpl, discordImpl]);
	});
});

describe("PluginLoader.loadedKeys", () => {
	it("returns the set of currently-loaded capability keys", async () => {
		const { loader } = loaderWith(
			{
				project: { name: "demo" },
				providers: { vault: "1password", source: "github" },
			},
			{
				"@theholocron/holocron-plugin-1password": makePlugin("1password", { vault: {} }),
				"@theholocron/holocron-plugin-github": makePlugin("github", { source: {} }),
			}
		);
		await loader.load();
		expect(new Set(loader.loadedKeys())).toEqual(new Set(["vault", "source"]));
	});
});

describe("PluginLoader — capability config packages (#75 Level 1)", () => {
	it("resolves a config package to the underlying plugin", async () => {
		const vaultImpl = { key: "vault", providerName: "1password" };
		const { loader, importer } = loaderWith(
			{
				project: { name: "demo" },
				// @acme/holocron-vault is a capability config package, not a plugin
				providers: { vault: "@acme/holocron-vault" },
			},
			{
				"@acme/holocron-vault": { default: { provider: "1password", options: { vault: "acme" } } },
				"@theholocron/holocron-plugin-1password": makePlugin("1password", { vault: vaultImpl }),
			}
		);

		await loader.load();
		expect(loader.get("vault")).toBe(vaultImpl);
		// The importer must have been called for BOTH the config package and the plugin
		expect(importer).toHaveBeenCalledWith("@acme/holocron-vault");
		expect(importer).toHaveBeenCalledWith("@theholocron/holocron-plugin-1password");
	});

	it("merges config-package options with per-project tuple options (project wins)", async () => {
		const captured: Record<string, unknown> = {};
		const { loader } = loaderWith(
			{
				project: { name: "demo" },
				// ["@acme/holocron-vault", { vault: "override" }] — project overrides preset
				providers: { vault: ["@acme/holocron-vault", { vault: "override" }] },
			},
			{
				"@acme/holocron-vault": { default: { provider: "1password", options: { vault: "preset", tag: "acme" } } },
				"@theholocron/holocron-plugin-1password": {
					createPlugin: (opts: Record<string, unknown>) => {
						Object.assign(captured, opts);
						return { name: "1p", capabilities: { vault: () => ({}) } };
					},
				},
			}
		);

		await loader.load();
		// Per-project "vault: override" wins over preset "vault: preset"
		expect(captured.vault).toBe("override");
		// Keys only in the preset are still present
		expect(captured.tag).toBe("acme");
	});

	it("resolves a config package used in a many-cardinality capability", async () => {
		const slackImpl = { key: "notifications", providerName: "slack" };
		const { loader } = loaderWith(
			{
				project: { name: "demo" },
				providers: {
					notifications: ["@acme/holocron-slack", "discord"],
				},
			},
			{
				"@acme/holocron-slack": { default: { provider: "slack", options: { channel: "#ops" } } },
				"@theholocron/holocron-plugin-slack": makePlugin("slack", { notifications: slackImpl }),
				"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications: {} }),
			}
		);

		await loader.load();
		const impls = loader.get("notifications");
		expect(impls[0]).toBe(slackImpl);
	});

	it("errors when a config package exports an unresolvable provider", async () => {
		const { loader } = loaderWith(
			{
				project: { name: "demo" },
				providers: { vault: "@acme/holocron-vault" },
			},
			{
				"@acme/holocron-vault": { default: { provider: "missing-vault" } },
				// @theholocron/holocron-plugin-missing-vault is intentionally absent
			}
		);
		const err = await loader.load().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(LoaderError);
		expect((err as Error).message).toMatch(/failed to import/);
	});

	it("errors when a package exports neither createPlugin nor a capability config", async () => {
		const { loader } = loaderWith(
			{
				project: { name: "demo" },
				providers: { vault: "broken" },
			},
			{
				"@theholocron/holocron-plugin-broken": { somethingElse: true },
			}
		);
		const err = await loader.load().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(LoaderError);
		expect((err as Error).message).toMatch(/createPlugin/);
	});
});

describe("cardinalityOf", () => {
	it("returns single for single-cardinality capabilities", () => {
		expect(cardinalityOf("source")).toBe("single");
		expect(cardinalityOf("vault")).toBe("single");
	});

	it("returns many for many-cardinality capabilities", () => {
		expect(cardinalityOf("notifications")).toBe("many");
	});
});
