import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runSecretSet } from "../commands/secret-set.js";
import { resolveConfig } from "../config/config.js";
import type { LoadedConfig } from "../config/load-config.js";
import { type PluginImporter, PluginLoader } from "../plugin/loader.js";

function loadedFrom(rawConfig: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return {
		resolved: resolveConfig(rawConfig),
		filepath: "/tmp/test/holocron.config.json",
	};
}

function makePlugin(name: string, caps: Record<string, unknown>) {
	return {
		createPlugin: (_opts: Record<string, unknown>) => ({
			name,
			capabilities: Object.fromEntries(Object.entries(caps).map(([k, impl]) => [k, () => impl])),
		}),
	};
}

function makeLoaderWith(loaded: LoadedConfig, modules: Record<string, unknown>): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg] as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(
		loaded.resolved,
		{ repoRoot: "/tmp/test", repo: "theholocron/holocron" },
		importer as unknown as PluginImporter
	);
}

function loadedDemo() {
	return loadedFrom({
		name: "demo",
		providers: { vault: "1password", secrets: "github" },
	});
}

describe("runSecretSet — value sourcing", () => {
	const originalEnv = process.env;
	beforeEach(() => {
		process.env = { ...originalEnv };
	});
	afterEach(() => {
		process.env = originalEnv;
	});

	it("uses the positional value when provided", async () => {
		const calls: Array<{ name: string; value: string }> = [];
		const loaded = loadedDemo();
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async (_scope: unknown, name: string, value: string) => {
						calls.push({ name, value });
					},
				},
			}),
		});

		const report = await runSecretSet({
			loaded,
			context: { repoRoot: "/tmp/test" },
			name: "NPM_TOKEN",
			value: "npm_explicit_xxx",
			loader,
			print: () => {},
		});

		expect(report.status).toBe("ok");
		expect(calls).toEqual([{ name: "NPM_TOKEN", value: "npm_explicit_xxx" }]);
	});

	it("falls back to env var matching the secret name", async () => {
		process.env.NPM_TOKEN = "npm_from_env_xxx";
		const calls: Array<{ value: string }> = [];
		const loaded = loadedDemo();
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async (_s: unknown, _n: string, value: string) => {
						calls.push({ value });
					},
				},
			}),
		});

		await runSecretSet({
			loaded,
			context: { repoRoot: "/tmp/test" },
			name: "NPM_TOKEN",
			loader,
			print: () => {},
		});
		expect(calls[0]?.value).toBe("npm_from_env_xxx");
	});

	it("honors --from-env to use a different env var name", async () => {
		process.env.HOLOCRON_NPM_TOKEN = "npm_alias_xxx";
		const calls: Array<{ value: string }> = [];
		const loaded = loadedDemo();
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async (_s: unknown, _n: string, value: string) => {
						calls.push({ value });
					},
				},
			}),
		});

		await runSecretSet({
			loaded,
			context: { repoRoot: "/tmp/test" },
			name: "NPM_TOKEN",
			fromEnv: "HOLOCRON_NPM_TOKEN",
			loader,
			print: () => {},
		});
		expect(calls[0]?.value).toBe("npm_alias_xxx");
	});

	it("reads from stdin when --from-stdin is set", async () => {
		const calls: Array<{ value: string }> = [];
		const loaded = loadedDemo();
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async (_s: unknown, _n: string, value: string) => {
						calls.push({ value });
					},
				},
			}),
		});

		await runSecretSet({
			loaded,
			context: { repoRoot: "/tmp/test" },
			name: "NPM_TOKEN",
			fromStdin: true,
			readStdin: async () => "npm_stdin_xxx\n",
			loader,
			print: () => {},
		});
		expect(calls[0]?.value).toBe("npm_stdin_xxx"); // newline trimmed
	});

	it("errors clearly when no value can be sourced", async () => {
		delete process.env.NPM_TOKEN;
		const loaded = loadedDemo();
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: { providerName: "github", setSecret: async () => {} },
			}),
		});

		await expect(
			runSecretSet({
				loaded,
				context: { repoRoot: "/tmp/test" },
				name: "NPM_TOKEN",
				loader,
				print: () => {},
			})
		).rejects.toThrow(/no value for secret/);
	});
});

describe("runSecretSet — scope + capability wiring", () => {
	it("passes the configured scope through to setSecret", async () => {
		const calls: Array<{ scope: unknown }> = [];
		const loaded = loadedDemo();
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async (scope: unknown) => {
						calls.push({ scope });
					},
				},
			}),
		});

		await runSecretSet({
			loaded,
			context: { repoRoot: "/tmp/test" },
			name: "PROD_SECRET",
			value: "v",
			scope: { kind: "environment", name: "production" },
			loader,
			print: () => {},
		});
		expect(calls[0]?.scope).toEqual({ kind: "environment", name: "production" });
	});

	it("throws when secrets capability is not loaded", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
		});

		await expect(
			runSecretSet({
				loaded,
				context: { repoRoot: "/tmp/test" },
				name: "X",
				value: "v",
				loader,
				print: () => {},
			})
		).rejects.toThrow(/secrets.*is not configured/);
	});

	it("dry-run skips the setSecret call", async () => {
		let called = false;
		const loaded = loadedDemo();
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async () => {
						called = true;
					},
				},
			}),
		});

		const report = await runSecretSet({
			loaded,
			context: { repoRoot: "/tmp/test", dryRun: true },
			name: "NPM_TOKEN",
			value: "npm_xxx",
			loader,
			print: () => {},
		});
		expect(called).toBe(false);
		expect(report.status).toBe("dry-run");
		expect(report.message).toContain("would: secrets.setSecret");
	});

	it("returns status=fail when the provider throws", async () => {
		const loaded = loadedDemo();
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async () => {
						throw new Error("403 forbidden");
					},
				},
			}),
		});
		const report = await runSecretSet({
			loaded,
			context: { repoRoot: "/tmp/test" },
			name: "NPM_TOKEN",
			value: "npm_xxx",
			loader,
			print: () => {},
		});
		expect(report.status).toBe("fail");
		expect(report.message).toContain("403 forbidden");
	});
});
