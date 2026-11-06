import { describe, expect, it, vi } from "vitest";

import { LoaderError } from "../loader-error/index.js";
import { createPluginSystem } from "./create-plugin-system.js";
import type { PluginImporter, ProviderEntry, ProviderTuple } from "./create-plugin-system.type.js";

type Caps = {
	source: { cardinality: "single"; impl: { name: string } };
	notify: { cardinality: "many"; impl: { name: string } };
	secrets: { cardinality: "many"; impl: { name: string } };
};

interface Config {
	providers: Partial<Record<keyof Caps, ProviderEntry>>;
}

interface Context {
	root: string;
}

const tuple = (provider: string, options: Record<string, unknown> = {}): ProviderTuple => ({
	provider,
	packageName: `@acme/cli-plugin-${provider}`,
	options,
});

const single = (provider: string, options?: Record<string, unknown>): ProviderEntry => ({
	cardinality: "single",
	tuple: tuple(provider, options),
});

const many = (...providers: string[]): ProviderEntry => ({
	cardinality: "many",
	tuples: providers.map((p) => tuple(p)),
});

function plugin(name: string, capabilities: Record<string, unknown>, seen?: (opts: Record<string, unknown>) => void) {
	return {
		createPlugin: (opts: Record<string, unknown>) => {
			seen?.(opts);
			return {
				name,
				capabilities: Object.fromEntries(Object.entries(capabilities).map(([k, v]) => [k, () => v])),
			};
		},
	};
}

function importerOf(modules: Record<string, unknown>): PluginImporter {
	return async (pkg) => {
		if (!(pkg in modules)) throw new Error(`Cannot find package '${pkg}'`);
		return modules[pkg];
	};
}

const base = {
	packagePrefix: "@acme/cli-plugin-",
	communityPrefix: "cli-plugin-",
	providers: (c: Config) => c.providers,
};

describe("createPluginSystem", () => {
	it("loads single and many capabilities into the registry", async () => {
		const { PluginLoader } = createPluginSystem<Caps, Config, Context>(base);
		const gh = { name: "gh" };
		const loader = new PluginLoader(
			{ providers: { source: single("github"), notify: many("slack", "discord") } },
			{ root: "/r" },
			importerOf({
				"@acme/cli-plugin-github": plugin("github", { source: gh }),
				"@acme/cli-plugin-slack": plugin("slack", { notify: { name: "slack" } }),
				"@acme/cli-plugin-discord": plugin("discord", { notify: { name: "discord" } }),
			})
		);
		await loader.load();
		expect(loader.get("source")).toBe(gh);
		expect(loader.get("notify").map((n) => n.name)).toEqual(["slack", "discord"]);
		expect(loader.loadedKeys().sort()).toEqual(["notify", "source"]);
		expect(loader.has("secrets")).toBe(false);
		expect([...loader.plugins().keys()]).toEqual(["github", "slack", "discord"]);
	});

	it("passes the context, then the provider's own options, to createPlugin by default", async () => {
		const seen = vi.fn();
		const { PluginLoader } = createPluginSystem<Caps, Config, Context>(base);
		const loader = new PluginLoader(
			{ providers: { source: single("github", { root: "/own", extra: 1 }) } },
			{ root: "/r" },
			importerOf({ "@acme/cli-plugin-github": plugin("github", { source: {} }, seen) })
		);
		await loader.load();
		expect(seen).toHaveBeenCalledWith({ root: "/own", extra: 1 });
	});

	it("builds the plugin options with pluginOptions when given", async () => {
		const seen = vi.fn();
		const { PluginLoader } = createPluginSystem<Caps, Config, Context>({
			...base,
			pluginOptions: ({ context, tuple: t }) => ({ from: context.root, ...t.options }),
		});
		const loader = new PluginLoader(
			{ providers: { source: single("github", { a: 1 }) } },
			{ root: "/r" },
			importerOf({ "@acme/cli-plugin-github": plugin("github", { source: {} }, seen) })
		);
		await loader.load();
		expect(seen).toHaveBeenCalledWith({ from: "/r", a: 1 });
	});

	it("records an import failure and keeps loading the rest", async () => {
		const { PluginLoader } = createPluginSystem<Caps, Config, Context>(base);
		const loader = new PluginLoader(
			{ providers: { source: single("gitlab"), notify: many("slack") } },
			{ root: "/r" },
			importerOf({ "@acme/cli-plugin-slack": plugin("slack", { notify: { name: "slack" } }) })
		);
		await loader.load();
		const [failure] = loader.loadFailures();
		expect(failure?.key).toBe("source");
		expect(failure?.packageName).toBe("@acme/cli-plugin-gitlab");
		expect(failure?.error).toBeInstanceOf(LoaderError);
		expect(failure?.error.message).toMatch(/^failed to import/);
		expect(loader.has("notify")).toBe(true);
		expect(() => loader.get("source")).toThrow(failure!.error);
	});

	it("records a package that exports neither createPlugin nor a capability config", async () => {
		const { PluginLoader } = createPluginSystem<Caps, Config, Context>(base);
		const loader = new PluginLoader(
			{ providers: { source: single("odd") } },
			{ root: "/r" },
			importerOf({ "@acme/cli-plugin-odd": { default: {} } })
		);
		await loader.load();
		expect(loader.loadFailures()[0]?.error.message).toMatch(/does not export `createPlugin/);
	});

	it("records a package whose module is null", async () => {
		const { PluginLoader } = createPluginSystem<Caps, Config, Context>(base);
		const loader = new PluginLoader(
			{ providers: { source: single("odd") } },
			{ root: "/r" },
			importerOf({ "@acme/cli-plugin-odd": null })
		);
		await loader.load();
		expect(loader.loadFailures()).toHaveLength(1);
	});

	it("records a plugin that does not implement the capability", async () => {
		const { PluginLoader } = createPluginSystem<Caps, Config, Context>(base);
		const loader = new PluginLoader(
			{ providers: { source: single("github") } },
			{ root: "/r" },
			importerOf({ "@acme/cli-plugin-github": plugin("github", {}) })
		);
		await loader.load();
		expect(loader.loadFailures()[0]?.error.message).toMatch(/does not implement the `source` capability/);
	});

	it("wraps a non-Error thrown by a capability factory", async () => {
		const { PluginLoader } = createPluginSystem<Caps, Config, Context>(base);
		const loader = new PluginLoader(
			{ providers: { source: single("github") } },
			{ root: "/r" },
			importerOf({
				"@acme/cli-plugin-github": {
					createPlugin: () => ({
						name: "github",
						capabilities: {
							source: () => {
								throw "plain string";
							},
						},
					}),
				},
			})
		);
		await loader.load();
		expect(loader.loadFailures()[0]?.error).toEqual(new Error("plain string"));
	});

	it("keeps the working providers of a many capability and skips the capability when all fail", async () => {
		const { PluginLoader } = createPluginSystem<Caps, Config, Context>(base);
		const loader = new PluginLoader(
			{ providers: { notify: many("slack", "gone"), secrets: many("none") } },
			{ root: "/r" },
			importerOf({ "@acme/cli-plugin-slack": plugin("slack", { notify: { name: "slack" } }) })
		);
		await loader.load();
		expect(loader.get("notify")).toHaveLength(1);
		expect(loader.has("secrets")).toBe(false);
		expect(loader.loadFailures()).toHaveLength(2);
	});

	it("says a capability that was never configured is not loaded, naming the config file", async () => {
		const { PluginLoader } = createPluginSystem<Caps, Config, Context>({
			...base,
			configFile: "mycli.config.json",
		});
		const loader = new PluginLoader({ providers: { source: undefined } }, { root: "/r" }, importerOf({}));
		await loader.load();
		expect(() => loader.get("source")).toThrow(/mycli\.config\.json/);
	});

	it("falls back to 'the config' when no config file is named", async () => {
		const { PluginLoader } = createPluginSystem<Caps, Config, Context>(base);
		const loader = new PluginLoader({ providers: {} }, { root: "/r" }, importerOf({}));
		await loader.load();
		expect(() => loader.get("source")).toThrow(/declared in the config\?/);
	});

	describe("capability config packages", () => {
		it("follows a config package to its provider, project options over the preset", async () => {
			const seen = vi.fn();
			const { PluginLoader } = createPluginSystem<Caps, Config, Context>(base);
			const loader = new PluginLoader(
				{ providers: { source: single("preset", { b: "project" }) } },
				{ root: "/r" },
				importerOf({
					"@acme/cli-plugin-preset": {
						default: { provider: "github", options: { a: "preset", b: "preset" } },
					},
					"@acme/cli-plugin-github": plugin("github", { source: { name: "gh" } }, seen),
				})
			);
			await loader.load();
			expect(loader.get("source")).toEqual({ name: "gh" });
			expect(seen).toHaveBeenCalledWith({ root: "/r", a: "preset", b: "project" });
		});

		it("records a config package whose provider cannot be imported", async () => {
			const { PluginLoader } = createPluginSystem<Caps, Config, Context>(base);
			const loader = new PluginLoader(
				{ providers: { source: single("preset") } },
				{ root: "/r" },
				importerOf({ "@acme/cli-plugin-preset": { default: { provider: "missing" } } })
			);
			await loader.load();
			expect(loader.loadFailures()[0]?.packageName).toBe("@acme/cli-plugin-preset");
			expect(loader.loadFailures()[0]?.error.message).toMatch(/cli-plugin-missing/);
		});
	});

	describe("preload", () => {
		it("runs first, with the options, can load, register and fail, and its keys are skipped by the loop", async () => {
			const order: string[] = [];
			const run = vi.fn(async (api, input) => {
				order.push("preload");
				const impl = await api.loadOne("secrets", tuple("vault"));
				api.register("secrets", [impl]);
				api.fail("secrets", tuple("broken"), new Error("nope"));
				expect(input.options).toEqual({ quiet: true });
			});
			const { PluginLoader } = createPluginSystem<
				Caps,
				Config,
				Context,
				Record<never, never>,
				{ quiet: boolean }
			>({
				...base,
				preload: { keys: ["secrets"], run },
			});
			const loader = new PluginLoader(
				{ providers: { secrets: many("vault"), source: single("github") } },
				{ root: "/r" },
				importerOf({
					"@acme/cli-plugin-vault": plugin("vault", { secrets: { name: "vault" } }),
					"@acme/cli-plugin-github": {
						createPlugin: () => {
							order.push("github");
							return { name: "github", capabilities: { source: () => ({ name: "gh" }) } };
						},
					},
				}),
				{ quiet: true }
			);
			await loader.load();
			expect(order).toEqual(["preload", "github"]);
			expect(loader.get("secrets")).toEqual([{ name: "vault" }]);
			expect(loader.loadFailures().map((f) => f.provider)).toEqual(["broken"]);
			expect(run).toHaveBeenCalledOnce();
		});
	});

	it("exposes the package resolver bound to the prefixes", () => {
		const { resolvePackage } = createPluginSystem<Caps, Config, Context>(base);
		expect(resolvePackage("github")).toBe("@acme/cli-plugin-github");
		expect(resolvePackage("cli-plugin-x")).toBe("cli-plugin-x");
	});
});
