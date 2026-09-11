import { describe, expect, it } from "vitest";

import { resolveConfig } from "../config/config.js";
import { type PluginImporter, PluginLoader } from "./loader.js";
import { assertPluginsResolvable, isModuleNotFound, WorkspaceContextError } from "./workspace.js";

function loaderWith(rawConfig: Parameters<typeof resolveConfig>[0], modules: Record<string, unknown>) {
	const config = resolveConfig(rawConfig);
	const importer = (async (pkg: string) => {
		if (!(pkg in modules)) {
			const err = new Error(`Cannot find package '${pkg}' imported from /x`) as NodeJS.ErrnoException;
			err.code = "ERR_MODULE_NOT_FOUND";
			throw err;
		}
		return modules[pkg];
	}) as PluginImporter;
	return new PluginLoader(config, { repoRoot: "/tmp/repo" }, importer);
}

function makePlugin(name: string, caps: Record<string, unknown>) {
	return {
		createPlugin: () => ({
			name,
			capabilities: Object.fromEntries(Object.entries(caps).map(([k, impl]) => [k, () => impl])),
		}),
	};
}

describe("isModuleNotFound", () => {
	it("matches ERR_MODULE_NOT_FOUND by code", () => {
		const err = Object.assign(new Error("nope"), { code: "ERR_MODULE_NOT_FOUND" });
		expect(isModuleNotFound(err)).toBe(true);
	});

	it("matches the 'Cannot find package' message", () => {
		expect(isModuleNotFound(new Error("Cannot find package '@x/y' imported from z"))).toBe(true);
	});

	it("matches a bare MODULE_NOT_FOUND string", () => {
		expect(isModuleNotFound(new Error("MODULE_NOT_FOUND"))).toBe(true);
	});

	it("is false for an unrelated error and for non-errors", () => {
		expect(isModuleNotFound(new Error("no Vercel token found"))).toBe(false);
		expect(isModuleNotFound("Cannot find package")).toBe(false);
		expect(isModuleNotFound(undefined)).toBe(false);
	});
});

describe("WorkspaceContextError", () => {
	it("falls back to a generic subject when no package names are known", () => {
		const err = new WorkspaceContextError("doctor", []);
		expect(err.message).toMatch(/`doctor` needs its plugins/);
	});

	it("does not add an '(and N others)' clause for a single package", () => {
		const err = new WorkspaceContextError("sync", ["@theholocron/holocron-plugin-github"]);
		expect(err.message).not.toMatch(/and \d+ other/);
	});
});

describe("assertPluginsResolvable", () => {
	it("throws WorkspaceContextError when every provider failed to import", async () => {
		const loader = loaderWith({ name: "demo", providers: { source: "github", secrets: "github" } }, {});
		await loader.load();

		const err = (() => {
			try {
				assertPluginsResolvable(loader, "sync");
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(WorkspaceContextError);
		expect((err as WorkspaceContextError).command).toBe("sync");
		expect((err as WorkspaceContextError).packages).toEqual(["@theholocron/holocron-plugin-github"]);
		expect((err as WorkspaceContextError).message).toMatch(/needs @theholocron\/holocron-plugin-github/);
		expect((err as WorkspaceContextError).message).toMatch(/pnpm exec holocron sync/);
	});

	it("names the extra count (singular) when one other package is unresolved", async () => {
		const loader = loaderWith({ name: "demo", providers: { source: "github", storage: "neon" } }, {});
		await loader.load();
		const err = (() => {
			try {
				assertPluginsResolvable(loader, "setup");
			} catch (e) {
				return e;
			}
		})();
		expect((err as WorkspaceContextError).message).toMatch(/\(and 1 other\)/);
	});

	it("pluralises the extra count when several other packages are unresolved", async () => {
		const loader = loaderWith(
			{ name: "demo", providers: { source: "github", storage: "neon", deployment: "vercel" } },
			{}
		);
		await loader.load();
		const err = (() => {
			try {
				assertPluginsResolvable(loader, "setup");
			} catch (e) {
				return e;
			}
		})();
		expect((err as WorkspaceContextError).message).toMatch(/\(and 2 others\)/);
	});

	it("is a no-op when at least one capability loaded", async () => {
		const loader = loaderWith(
			{ name: "demo", providers: { source: "github", storage: "neon" } },
			{ "@theholocron/holocron-plugin-github": makePlugin("github", { source: {} }) }
		);
		await loader.load();
		expect(() => assertPluginsResolvable(loader, "setup")).not.toThrow();
	});

	it("is a no-op when there are no providers / no failures", async () => {
		const loader = loaderWith({ name: "demo", providers: {} }, {});
		await loader.load();
		expect(() => assertPluginsResolvable(loader, "doctor")).not.toThrow();
	});

	it("leaves a non-import failure (e.g. auth error) alone for the command's own reporting", async () => {
		const loader = loaderWith(
			{ name: "demo", providers: { source: "github" } },
			{
				"@theholocron/holocron-plugin-github": {
					createPlugin: () => {
						throw new Error("no GitHub token found");
					},
				},
			}
		);
		await loader.load();
		expect(() => assertPluginsResolvable(loader, "doctor")).not.toThrow();
	});
});
