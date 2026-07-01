import { describe, expect, it, vi } from "vitest";

import { LoaderError, PluginLoader, type PluginImporter } from "../loader.js";
import { resolveConfig } from "../config.js";

function loaderWith(rawConfig: Parameters<typeof resolveConfig>[0], modules: Record<string, unknown>) {
	const config = resolveConfig(rawConfig);
	const importer = vi.fn(async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg] as Parameters<PluginImporter>[0] extends never
			? never
			: Awaited<ReturnType<PluginImporter>>;
	});
	const loader = new PluginLoader(
		config,
		{ repoRoot: "/tmp/test-repo", repo: "theholocron/holocron" },
		importer as unknown as PluginImporter
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
