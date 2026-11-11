import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { clearCredentials, getCredential } from "@theholocron/kyber/secrets";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../../config/config/index.js";
import { WorkspaceContextError } from "../workspace/index.js";
import { cardinalityOf, LoaderError, PluginLoader } from "./loader.js";
import type { PluginImporter } from "./loader.type.js";

vi.mock("node:module", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:module")>();
	return { ...actual, createRequire: vi.fn(actual.createRequire) };
});

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
				name: "demo",
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
			{ name: "demo", providers: { vault: "1password" } },
			{ "@theholocron/holocron-plugin-1password": makePlugin("1password", { vault: {} }) }
		);
		await loader.load();
		expect(() => loader.get("source")).toThrow(LoaderError);
		expect(() => loader.get("source")).toThrow(/holocron\.config\.json/);
	});

	it("records a load failure when the package cannot be imported — other plugins still load", async () => {
		const { loader } = loaderWith(
			{
				name: "demo",
				providers: { vault: "1password", source: "gitlab" },
			},
			{ "@theholocron/holocron-plugin-1password": makePlugin("1password", { vault: {} }) }
		);
		await loader.load();
		expect(loader.has("vault")).toBe(true);
		expect(loader.has("source")).toBe(false);
		expect(loader.loadFailures()).toHaveLength(1);
		expect(loader.loadFailures()[0]).toMatchObject({ key: "source", provider: "gitlab" });
		expect(loader.loadFailures()[0]!.error.message).toMatch(/failed to import/);
		// get() re-surfaces the original error, not a generic "not loaded"
		expect(() => loader.get("source")).toThrow(/failed to import/);
	});

	it("records a load failure when the package does not export createPlugin", async () => {
		const { loader } = loaderWith(
			{
				name: "demo",
				providers: { vault: "1password", source: "broken" },
			},
			{
				"@theholocron/holocron-plugin-1password": makePlugin("1password", { vault: {} }),
				"@theholocron/holocron-plugin-broken": { somethingElse: true },
			}
		);
		await loader.load();
		expect(loader.loadFailures()[0]!.error.message).toMatch(/createPlugin/);
	});

	it("records a load failure when the plugin does not implement the requested capability", async () => {
		const { loader } = loaderWith(
			{
				name: "demo",
				providers: { vault: "1password", source: "github" },
			},
			{
				"@theholocron/holocron-plugin-1password": makePlugin("1password", { vault: {} }),
				// GitHub plugin advertises issues but NOT source — should fail
				"@theholocron/holocron-plugin-github": makePlugin("github", { issues: {} }),
			}
		);
		await loader.load();
		expect(loader.loadFailures()[0]!.error.message).toMatch(/does not implement the `source` capability/);
	});

	it("wraps a non-Error thrown by a plugin factory into an Error", async () => {
		const { loader } = loaderWith(
			{ name: "demo", providers: { source: "github" } },
			{
				"@theholocron/holocron-plugin-github": {
					createPlugin: () => {
						throw "boom"; // exercising the non-Error path
					},
				},
			}
		);
		await loader.load();
		const [failure] = loader.loadFailures();
		expect(failure!.error).toBeInstanceOf(Error);
		expect(failure!.error.message).toBe("boom");
	});

	it("merges plugin tuple options with the runtime context", async () => {
		const captured: Record<string, unknown> = {};
		const { loader } = loaderWith(
			{
				name: "demo",
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
			name: "demo",
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

	it("routes cliTokens[provider] to the matching plugin as cliToken", async () => {
		const capturedAtVault: Record<string, unknown> = {};
		const capturedAtSource: Record<string, unknown> = {};
		const config = resolveConfig({
			name: "demo",
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
			{ repoRoot: "/tmp", cliTokens: { github: "ghp_specific", "1password": "op_specific" } },
			importer as unknown as PluginImporter
		);
		await loader.load();
		expect(capturedAtSource.cliToken).toBe("ghp_specific");
		expect(capturedAtVault.cliToken).toBe("op_specific");
	});

	it("falls back to bare cliToken for plugins without a matching cliTokens entry", async () => {
		const capturedAtVault: Record<string, unknown> = {};
		const capturedAtSource: Record<string, unknown> = {};
		const config = resolveConfig({
			name: "demo",
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
			{ repoRoot: "/tmp", cliToken: "bare-fallback", cliTokens: { github: "ghp_specific" } },
			importer as unknown as PluginImporter
		);
		await loader.load();
		// github gets its keyed token
		expect(capturedAtSource.cliToken).toBe("ghp_specific");
		// 1password falls back to the bare token
		expect(capturedAtVault.cliToken).toBe("bare-fallback");
	});

	it("never forwards cliTokens map to plugins", async () => {
		const capturedAtSource: Record<string, unknown> = {};
		const config = resolveConfig({
			name: "demo",
			providers: { source: "github" },
		});
		const importer = vi.fn(async () => ({
			createPlugin: (opts: Record<string, unknown>) => {
				Object.assign(capturedAtSource, opts);
				return { name: "gh", capabilities: { source: () => ({}) } };
			},
		}));
		const loader = new PluginLoader(
			config,
			{ repoRoot: "/tmp", cliTokens: { github: "ghp_specific" } },
			importer as unknown as PluginImporter
		);
		await loader.load();
		expect(capturedAtSource.cliToken).toBe("ghp_specific");
		expect(capturedAtSource.cliTokens).toBeUndefined();
	});
});

describe("PluginLoader — repo defaults", () => {
	it("injects config.repo into plugin options when context.repo is absent", async () => {
		const captured: Record<string, unknown> = {};
		const config = resolveConfig({
			name: "demo",
			repo: { name: "acme/foo" },
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

	it("context.repo (CLI --repo flag) overrides config.repo", async () => {
		const captured: Record<string, unknown> = {};
		const config = resolveConfig({
			name: "demo",
			repo: { name: "acme/from-config" },
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

	it("per-plugin tuple options override both context and repo defaults", async () => {
		const captured: Record<string, unknown> = {};
		const config = resolveConfig({
			name: "demo",
			repo: { name: "acme/from-config" },
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
			name: "demo", // no repo
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
				name: "demo",
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

	it("keeps the working providers when one of a multi-cardinality set fails to load", async () => {
		const slackImpl = { key: "notifications", providerName: "slack" };
		const { loader } = loaderWith(
			{
				name: "demo",
				providers: { notifications: ["slack", "discord"] },
			},
			{
				"@theholocron/holocron-plugin-slack": makePlugin("slack", { notifications: slackImpl }),
				// discord plugin absent → load failure for that entry
			}
		);

		await loader.load();
		expect(loader.get("notifications")).toEqual([slackImpl]);
		expect(loader.loadFailures()).toMatchObject([{ key: "notifications", provider: "discord" }]);
	});

	it("does not register a multi-cardinality capability when every provider fails", async () => {
		const { loader } = loaderWith(
			{ name: "demo", providers: { notifications: ["slack", "discord"] } },
			{} // neither plugin present
		);

		await loader.load();
		expect(loader.has("notifications")).toBe(false);
		expect(loader.loadFailures()).toHaveLength(2);
	});
});

describe("PluginLoader — sparse providers map", () => {
	it("skips an undefined provider entry", async () => {
		// resolveConfig strips these, but the `Partial<Record>` type permits
		// them — the guard keeps a hand-built config from throwing.
		const config = resolveConfig({ name: "demo", providers: {} });
		(config.providers as Record<string, unknown>).source = undefined;
		const loader = new PluginLoader(config, { repoRoot: "/tmp" });

		await loader.load();
		expect(loader.loadedKeys()).toEqual([]);
		expect(loader.loadFailures()).toEqual([]);
	});
});

describe("PluginLoader.loadedKeys", () => {
	it("returns the set of currently-loaded capability keys", async () => {
		const { loader } = loaderWith(
			{
				name: "demo",
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
				name: "demo",
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
				name: "demo",
				// ["@acme/holocron-vault", { vault: "override" }] — project overrides preset
				providers: { vault: ["@acme/holocron-vault", { vault: "override" }] },
			},
			{
				"@acme/holocron-vault": {
					default: { provider: "1password", options: { vault: "preset", tag: "acme" } },
				},
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
				name: "demo",
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
				name: "demo",
				providers: { vault: "@acme/holocron-vault" },
			},
			{
				"@acme/holocron-vault": { default: { provider: "missing-vault" } },
				// @theholocron/holocron-plugin-missing-vault is intentionally absent
			}
		);
		await loader.load();
		const [failure] = loader.loadFailures();
		expect(failure!.error).toBeInstanceOf(LoaderError);
		expect(failure!.error.message).toMatch(/failed to import/);
	});

	it("errors when a package exports neither createPlugin nor a capability config", async () => {
		const { loader } = loaderWith(
			{
				name: "demo",
				providers: { vault: "broken" },
			},
			{
				"@theholocron/holocron-plugin-broken": { somethingElse: true },
			}
		);
		await loader.load();
		const [failure] = loader.loadFailures();
		expect(failure!.error).toBeInstanceOf(LoaderError);
		expect(failure!.error.message).toMatch(/createPlugin/);
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

describe("PluginLoader — defaultImporter (cwd resolution)", () => {
	it("resolves packages from cwd when no importer is injected", async () => {
		// Use vi.mock + vi.mocked to control createRequire without depending on
		// a plugin package being built — Turbo skips plugin builds when only
		// unrelated files change, making the real package unreliable in CI.
		// Point resolve at this test file (always exists); the imported module
		// has no createPlugin so loadOne throws LoaderError — that's fine, we only
		// need the try-branch in defaultImporter covered (lines A-C).
		const selfPath = new URL("./loader.test.js", import.meta.url).pathname;
		const mockResolve = vi.fn().mockReturnValue(selfPath);
		vi.mocked(createRequire).mockReturnValueOnce({ resolve: mockResolve } as unknown as ReturnType<
			typeof createRequire
		>);

		const config = resolveConfig({ name: "test", providers: { wiki: "fern" } });
		const loader = new PluginLoader(config, { repoRoot: "/tmp", repo: "test/test" });
		await loader.load();
		expect(loader.loadFailures()[0]!.error).toBeInstanceOf(LoaderError);
		expect(mockResolve).toHaveBeenCalledWith("@theholocron/holocron-plugin-fern");
		vi.mocked(createRequire).mockRestore();
	});

	it("falls back to bare import when the package is not in cwd", async () => {
		// A provider that does not exist anywhere — covers the catch branch.
		const config = resolveConfig({ name: "test", providers: { source: "no-such-provider-xz9" as "github" } });
		const loader = new PluginLoader(config, { repoRoot: "/tmp", repo: "test/test" });
		await loader.load();
		expect(loader.loadFailures()[0]!.error).toBeInstanceOf(LoaderError);
	});
});

describe("PluginLoader — probes", () => {
	const probe = { summary: "reads", writes: false, run: async () => {} };

	it("keeps the probes a plugin offers, by provider name", async () => {
		const { loader } = loaderWith(
			{ name: "demo", providers: { source: "github", vault: "1password" } },
			{
				"@theholocron/holocron-plugin-github": {
					createPlugin: () => ({
						name: "github",
						probes: { look: probe },
						capabilities: { source: () => ({}) },
					}),
				},
				"@theholocron/holocron-plugin-1password": makePlugin("1password", { vault: {} }),
			}
		);
		await loader.load();
		expect([...loader.probes().keys()]).toEqual(["github"]);
		expect(loader.probes().get("github")).toEqual({ look: probe });
	});

	it("has none for a plugin with no probes, or an empty set", async () => {
		const { loader } = loaderWith(
			{ name: "demo", providers: { source: "github" } },
			{
				"@theholocron/holocron-plugin-github": {
					createPlugin: () => ({ name: "github", probes: {}, capabilities: { source: () => ({}) } }),
				},
			}
		);
		await loader.load();
		expect(loader.probes().size).toBe(0);
	});
});

describe("PluginLoader — setup and doctor", () => {
	const action = async () => [];

	it("keeps the setup and doctor a plugin offers, by provider name, and leaves out one with neither", async () => {
		const { loader } = loaderWith(
			{ name: "demo", providers: { source: "github", vault: "1password", ci: "vercel" as "github" } },
			{
				"@theholocron/holocron-plugin-github": {
					createPlugin: () => ({ name: "github", setup: action, capabilities: { source: () => ({}) } }),
				},
				"@theholocron/holocron-plugin-1password": {
					createPlugin: () => ({ name: "1password", doctor: action, capabilities: { vault: () => ({}) } }),
				},
				"@theholocron/holocron-plugin-vercel": makePlugin("vercel", { ci: {} }),
			}
		);
		await loader.load();
		const found = loader.providerActions();
		expect([...found.keys()].sort()).toEqual(["1password", "github"]);
		expect(found.get("github")).toEqual({ setup: action });
		expect(found.get("1password")).toEqual({ doctor: action });
	});
});

describe("PluginLoader — a provider the config does not name", () => {
	const action = async () => [];

	it("loads it by name with the given options and token, and returns its setup and doctor", async () => {
		const seen = vi.fn();
		const { loader } = loaderWith(
			{ name: "demo", providers: { source: "github" } },
			{
				"@theholocron/holocron-plugin-github": makePlugin("github", { source: {} }),
				"@theholocron/holocron-plugin-linear": {
					createPlugin: (opts: Record<string, unknown>) => {
						seen(opts);
						return { name: "linear", setup: action, doctor: action, capabilities: {} };
					},
				},
			}
		);
		await loader.load();
		const actions = await loader.loadProviderActions("linear", { team: "ENG" });
		expect(actions).toEqual({ setup: action, doctor: action });
		expect(seen).toHaveBeenCalledWith(expect.objectContaining({ team: "ENG", repoRoot: "/tmp/test-repo" }));
		expect(loader.loadedKeys()).toEqual(["source"]);
	});

	it("leaves out the action a provider does not have", async () => {
		const { loader } = loaderWith(
			{ name: "demo", providers: {} },
			{
				"@theholocron/holocron-plugin-linear": {
					createPlugin: () => ({ name: "linear", doctor: action, capabilities: {} }),
				},
			}
		);
		expect(await loader.loadProviderActions("linear", {})).toEqual({ doctor: action });
	});

	it("is a WorkspaceContextError when the package cannot be imported", async () => {
		const { loader } = loaderWith({ name: "demo", providers: {} }, {});
		const err = await loader.loadProviderActions("linear", {}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(WorkspaceContextError);
		expect((err as WorkspaceContextError).packages).toEqual(["@theholocron/holocron-plugin-linear"]);
	});

	it("throws what createPlugin throws as it is", async () => {
		const { loader } = loaderWith(
			{ name: "demo", providers: {} },
			{
				"@theholocron/holocron-plugin-linear": {
					createPlugin: () => {
						throw new Error("bad options");
					},
				},
			}
		);
		const err = await loader.loadProviderActions("linear", {}).catch((e: unknown) => e);
		expect(err).not.toBeInstanceOf(WorkspaceContextError);
		expect((err as Error).message).toBe("bad options");
	});
});

describe("PluginLoader — credentials", () => {
	afterEach(clearCredentials);

	const config = (extra: Record<string, unknown> = {}) => ({
		name: "demo",
		providers: { credentials: ["1password" as const], source: "github" as const },
		credentials: { environment: "Holocron" },
		...extra,
	});
	const creds = (read: (environment: string) => Promise<Record<string, string>>) => ({
		key: "credentials",
		providerName: "1password",
		read: vi.fn(read),
	});

	it("reads the environment into the store before any other plugin is created", async () => {
		const impl = creds(async () => ({ HOLOCRON_ORG_TOKEN: "from-op" }));
		let seenWhenSourceCreated: string | undefined;
		const { loader } = loaderWith(config(), {
			"@theholocron/holocron-plugin-1password": makePlugin("1password", { credentials: impl }),
			"@theholocron/holocron-plugin-github": {
				createPlugin: () => {
					seenWhenSourceCreated = getCredential("HOLOCRON_ORG_TOKEN");
					return { name: "github", capabilities: { source: () => ({}) } };
				},
			},
		});

		await loader.load();

		expect(impl.read).toHaveBeenCalledExactlyOnceWith("Holocron");
		expect(seenWhenSourceCreated).toBe("from-op");
		expect(loader.has("credentials")).toBe(true);
		expect(loader.get("credentials")).toEqual([impl]);
		expect(loader.has("source")).toBe(true);
	});

	it("loads the providers without asking them for a value when readCredentials is false", async () => {
		const impl = creds(async () => ({ T: "x" }));
		const importer = (async (pkg: string) =>
			pkg === "@theholocron/holocron-plugin-1password"
				? makePlugin("1password", { credentials: impl })
				: undefined) as unknown as PluginImporter;
		const loader = new PluginLoader(resolveConfig(config()), { repoRoot: "/tmp/test-repo" }, importer, {
			readCredentials: false,
		});
		await loader.load();
		expect(impl.read).not.toHaveBeenCalled();
		expect(getCredential("T")).toBeUndefined();
		expect(loader.get("credentials")).toEqual([impl]);
	});

	it("reads the environment a provider names itself, ahead of the shared one", async () => {
		const own = creds(async () => ({ T: "own" }));
		const { loader } = loaderWith(config({ providers: { credentials: [["1password", { environment: "Own" }]] } }), {
			"@theholocron/holocron-plugin-1password": makePlugin("1password", { credentials: own }),
		});
		await loader.load();
		expect(own.read).toHaveBeenCalledExactlyOnceWith("Own");
		expect(getCredential("T")).toBe("own");
	});

	it("does not read a source again that an earlier loader already read", async () => {
		const impl = creds(async () => ({ T: "x" }));
		const modules = { "@theholocron/holocron-plugin-1password": makePlugin("1password", { credentials: impl }) };
		const cfg = {
			name: "demo",
			providers: { credentials: ["1password" as const] },
			credentials: { environment: "Holocron" },
		};
		await loaderWith(cfg, modules).loader.load();
		await loaderWith(cfg, modules).loader.load();
		expect(impl.read).toHaveBeenCalledTimes(1);
	});

	it("records a failed read and still loads the other plugins", async () => {
		const impl = creds(async () => {
			throw new Error("op is locked");
		});
		const { loader } = loaderWith(config(), {
			"@theholocron/holocron-plugin-1password": makePlugin("1password", { credentials: impl }),
			"@theholocron/holocron-plugin-github": makePlugin("github", { source: {} }),
		});

		await loader.load();

		expect(loader.loadFailures().map((f) => [f.key, f.provider, f.error.message])).toEqual([
			["credentials", "1password", "op is locked"],
		]);
		expect(getCredential("HOLOCRON_ORG_TOKEN")).toBeUndefined();
		expect(loader.has("source")).toBe(true);
	});

	it("records a provider that is not installed and keeps going", async () => {
		const { loader } = loaderWith(config(), {
			"@theholocron/holocron-plugin-github": makePlugin("github", { source: {} }),
		});
		await loader.load();
		expect(loader.loadFailures()[0]?.key).toBe("credentials");
		expect(loader.has("credentials")).toBe(false);
		expect(loader.has("source")).toBe(true);
	});

	it("fails the provider when the config names no environment", async () => {
		const impl = creds(async () => ({}));
		const loaded = resolveConfig(config({ providers: { credentials: ["doppler"] } }));
		delete loaded.credentials;
		const loader = new PluginLoader(loaded, { repoRoot: "/tmp/test-repo" }, (async () =>
			makePlugin("doppler", { credentials: impl })) as PluginImporter);
		await loader.load();
		expect(loader.loadFailures()[0]?.error.message).toMatch(/credentials\.environment/);
		expect(impl.read).not.toHaveBeenCalled();
	});

	it("reads two entries of the same provider, each its own environment, and finds a name in either (#1827)", async () => {
		const impl = creds(async (environment): Promise<Record<string, string>> => {
			if (environment === "Holocron") return { TOKEN: "t" };
			return { CLOUDFLARE_ACCOUNT_ID: "acct", TOKEN: "ignored" };
		});
		const { loader } = loaderWith(
			config({
				providers: {
					credentials: [
						["1password", { environment: "Holocron" }],
						["1password", { environment: "Holocron - GitHub Actions variables" }],
					],
				},
			}),
			{ "@theholocron/holocron-plugin-1password": makePlugin("1password", { credentials: impl }) }
		);
		await loader.load();
		expect(impl.read.mock.calls.map(([environment]) => environment)).toEqual([
			"Holocron",
			"Holocron - GitHub Actions variables",
		]);
		expect(getCredential("CLOUDFLARE_ACCOUNT_ID")).toBe("acct");
		// The first entry wins for a name both have.
		expect(getCredential("TOKEN")).toBe("t");
		expect(loader.get("credentials")).toHaveLength(2);
	});

	it("tries several providers in the order the config lists them", async () => {
		const first = creds(async () => ({ T: "first" }));
		const second = creds(async () => ({ T: "second", U: "u" }));
		const { loader } = loaderWith(config({ providers: { credentials: ["1password", "doppler"] } }), {
			"@theholocron/holocron-plugin-1password": makePlugin("1password", { credentials: first }),
			"@theholocron/holocron-plugin-doppler": makePlugin("doppler", { credentials: second }),
		});
		await loader.load();
		expect(getCredential("T")).toBe("first");
		expect(getCredential("U")).toBe("u");
		expect(loader.get("credentials")).toEqual([first, second]);
	});
});

describe("PluginLoader — the repo's .env", () => {
	afterEach(clearCredentials);

	const load = async (
		root: string,
		rawConfig: Parameters<typeof resolveConfig>[0],
		modules: Record<string, unknown>
	) => {
		const importer = (async (pkg: string) => modules[pkg]) as PluginImporter;
		await new PluginLoader(resolveConfig(rawConfig), { repoRoot: root }, importer).load();
	};
	const root = () => mkdtempSync(join(tmpdir(), "holocron-loader-"));

	it("puts the file's variables in the store when it exists, with no config", async () => {
		const dir = root();
		writeFileSync(join(dir, ".env"), "HOLOCRON_ORG_TOKEN=from-file\n");
		await load(
			dir,
			{ name: "demo", providers: { source: "github" } },
			{
				"@theholocron/holocron-plugin-github": makePlugin("github", { source: {} }),
			}
		);
		expect(getCredential("HOLOCRON_ORG_TOKEN")).toBe("from-file");
	});

	it("does nothing when there is no file", async () => {
		await load(
			root(),
			{ name: "demo", providers: { source: "github" } },
			{
				"@theholocron/holocron-plugin-github": makePlugin("github", { source: {} }),
			}
		);
		expect(getCredential("HOLOCRON_ORG_TOKEN")).toBeUndefined();
	});

	it("ignores a .env in a subdirectory of the repo root", async () => {
		const dir = root();
		mkdirSync(join(dir, "sub"));
		writeFileSync(join(dir, "sub", ".env"), "HOLOCRON_ORG_TOKEN=from-sub\n");
		await load(
			dir,
			{ name: "demo", providers: { source: "github" } },
			{
				"@theholocron/holocron-plugin-github": makePlugin("github", { source: {} }),
			}
		);
		expect(getCredential("HOLOCRON_ORG_TOKEN")).toBeUndefined();
	});

	it("is read once per process: a second loader on the same root does not read it again", async () => {
		const dir = root();
		writeFileSync(join(dir, ".env"), "T=first\n");
		const cfg = { name: "demo", providers: { source: "github" } } as const;
		const modules = { "@theholocron/holocron-plugin-github": makePlugin("github", { source: {} }) };
		await load(dir, cfg, modules);
		writeFileSync(join(dir, ".env"), "T=second\n");
		await load(dir, cfg, modules);
		expect(getCredential("T")).toBe("first");
	});

	it("wins over a credentials provider, which fills in what the file lacks", async () => {
		const dir = root();
		writeFileSync(join(dir, ".env"), "T=from-file\n");
		const impl = {
			key: "credentials",
			providerName: "1password",
			read: vi.fn(async () => ({ T: "from-op", U: "u" })),
		};
		await load(
			dir,
			{ name: "demo", providers: { credentials: ["1password"] }, credentials: { environment: "Holocron" } },
			{
				"@theholocron/holocron-plugin-1password": makePlugin("1password", { credentials: impl }),
			}
		);
		expect(getCredential("T")).toBe("from-file");
		expect(getCredential("U")).toBe("u");
	});
});
