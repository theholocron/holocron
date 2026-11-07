import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { runSecretsSync } from "./secrets-sync.js";

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

describe("runSecretsSync", () => {
	it("errors when the vault provider does not implement readEnvironment", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				// No readEnvironment method
				vault: { providerName: "1password", list: async () => [] },
			}),
		});

		await expect(
			runSecretsSync({
				loaded,
				context: { repoRoot: "/tmp/test" },
				environmentId: "env_1",
				loader,
				print: () => {},
			})
		).rejects.toThrow(/readEnvironment/);
	});

	it("puts a PEM key whose line breaks became spaces back on its lines before it reaches the secret", async () => {
		// built from parts so no complete private-key block sits in this file
		const kind = "RSA PRIVATE KEY";
		const begin = ["-----", "BEGIN ", kind, "-----"].join("");
		const end = ["-----", "END ", kind, "-----"].join("");
		const body = "QUJD".repeat(40);
		const setSecretCalls: Array<{ name: string; value: string }> = [];
		const loaded = loadedFrom({ name: "demo", providers: { vault: "1password", secrets: "github" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ APP_PRIVATE_KEY: `${begin} ${body} ${end}`, PLAIN: "sk_test_xxx" }),
				},
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async (_scope: unknown, name: string, value: string) => {
						setSecretCalls.push({ name, value });
					},
				},
			}),
		});

		await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			loader,
			print: () => {},
			logger: fakeLogger(),
		});

		const key = setSecretCalls.find((c) => c.name === "APP_PRIVATE_KEY")!.value;
		expect(key).toBe(`${begin}\n${body.slice(0, 64)}\n${body.slice(64, 128)}\n${body.slice(128)}\n${end}\n`);
		expect(setSecretCalls.find((c) => c.name === "PLAIN")!.value).toBe("sk_test_xxx");
	});

	it("skips a name GitHub would refuse with the reason, without calling the API (holocron#1907)", async () => {
		const setSecretCalls: string[] = [];
		const lines: string[] = [];
		const loaded = loadedFrom({ name: "demo", providers: { vault: "1password", secrets: "github" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({
						GITHUB_APP_ID: "123",
						GITHUB_APP_PRIVATE_KEY: "pem",
						"1BAD": "x",
						"has-dash": "x",
						SENTINEL_WEBHOOK_SECRET: "s",
					}),
				},
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async (_scope: unknown, name: string) => {
						setSecretCalls.push(name);
					},
				},
			}),
		});

		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			loader,
			print: (l: string) => lines.push(l),
			logger: fakeLogger(),
		});

		expect(setSecretCalls).toEqual(["SENTINEL_WEBHOOK_SECRET"]);
		expect(report.summary).toMatchObject({ ok: 1, fail: 0, skip: 4 });
		const skipped = report.rows.find((r) => r.key === "GITHUB_APP_ID")!;
		expect(skipped.status).toBe("skip");
		expect(skipped.message).toMatch(/invalid name: GitHub reserves names starting with GITHUB_/);
		expect(lines.join("\n")).toMatch(/GITHUB_APP_PRIVATE_KEY/);
	});

	it("does not apply GitHub's naming rules to a secrets provider that is not GitHub", async () => {
		const setSecretCalls: string[] = [];
		const loaded = loadedFrom({ name: "demo", providers: { vault: "1password", secrets: "github" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { providerName: "1password", readEnvironment: async () => ({ GITHUB_APP_ID: "123" }) },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "other",
					setSecret: async (_scope: unknown, name: string) => {
						setSecretCalls.push(name);
					},
				},
			}),
		});

		await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			loader,
			print: () => {},
			logger: fakeLogger(),
		});

		expect(setSecretCalls).toEqual(["GITHUB_APP_ID"]);
	});

	it("fans out vault keys to secrets (repo scope)", async () => {
		const setSecretCalls: Array<{ name: string; value: string }> = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", secrets: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async (_id: string) => ({
						CLERK_SECRET_KEY: "sk_test_xxx",
						NEON_DATABASE_URL: "postgresql://...",
					}),
				},
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async (_scope: unknown, name: string, value: string) => {
						setSecretCalls.push({ name, value });
					},
				},
			}),
		});

		const log = fakeLogger();
		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			loader,
			print: () => {},
			logger: log,
		});

		expect(setSecretCalls).toHaveLength(2);
		expect(setSecretCalls.map((c) => c.name).sort()).toEqual(["CLERK_SECRET_KEY", "NEON_DATABASE_URL"]);
		expect(report.summary.ok).toBe(2);
		expect(report.summary.fail).toBe(0);

		// per-secret lines log the KEY name, never the value
		expect(log.info).toHaveBeenCalledWith(
			expect.objectContaining({ key: "CLERK_SECRET_KEY", status: "ok" }),
			expect.stringContaining("CLERK_SECRET_KEY")
		);
		const logged = JSON.stringify(log.info.mock.calls);
		expect(logged).not.toContain("sk_test_xxx");
		expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ keys: 2 }), "secrets sync: done");
	});

	it("skips deployment sync when projectId is missing", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ A: "a" }),
				},
			}),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					setEnvVar: async () => {
						throw new Error("should not be called when projectId is missing");
					},
				},
			}),
		});

		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			loader,
			print: () => {},
		});

		const skipped = report.rows.filter((r) => r.status === "skip");
		expect(skipped.length).toBeGreaterThan(0);
		expect(skipped[0]?.message).toMatch(/projectId/);
	});

	it("fans out to deployment env vars for each target when projectId is provided", async () => {
		const setEnvCalls: Array<{
			projectId: string;
			target: string;
			name: string;
			value: string;
		}> = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ KEY_A: "a", KEY_B: "b" }),
				},
			}),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					setEnvVar: async (projectId: string, target: string, name: string, value: string) => {
						setEnvCalls.push({ projectId, target, name, value });
					},
				},
			}),
		});

		await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			projectId: "prj_123",
			targets: ["production", "preview"],
			loader,
			print: () => {},
		});

		expect(setEnvCalls).toHaveLength(4); // 2 keys × 2 targets
		expect(new Set(setEnvCalls.map((c) => c.target))).toEqual(new Set(["production", "preview"]));
		expect(setEnvCalls.every((c) => c.projectId === "prj_123")).toBe(true);
	});

	it("dry-run reports `dry-run` rows without calling mutators", async () => {
		let called = false;
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", secrets: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ X: "x" }),
				},
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async () => {
						called = true;
					},
				},
			}),
		});

		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test", dryRun: true },
			environmentId: "env_1",
			loader,
			print: () => {},
		});

		expect(called).toBe(false);
		expect(report.rows.every((r) => r.status === "dry-run")).toBe(true);
		expect(report.summary.dryRun).toBe(1);
	});

	it("soft-skips with string coercion when provider throws a non-Error", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", secrets: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ KEY: "value" }),
				},
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async () => {
						throw "403 forbidden string";
					},
				},
			}),
		});

		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			loader,
			print: () => {},
		});

		expect(report.summary.fail).toBe(1);
		const failedRow = report.rows.find((r) => r.status === "fail");
		expect(failedRow?.message).toBe("403 forbidden string");
	});

	it("githubSecretKeys restricts secrets to only the listed keys", async () => {
		const setSecretCalls: Array<{ name: string }> = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", secrets: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ INGEST_TOKEN: "t", OTHER_KEY: "o", DEPLOY_ONLY: "d" }),
				},
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async (_scope: unknown, name: string) => {
						setSecretCalls.push({ name });
					},
				},
			}),
		});

		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			githubSecretKeys: ["INGEST_TOKEN"],
			loader,
			print: () => {},
		});

		expect(setSecretCalls).toEqual([{ name: "INGEST_TOKEN" }]);
		expect(report.summary.ok).toBe(1);
	});

	it("githubSecretScope: organization passes the given scope straight through to setSecret", async () => {
		const scopesSeen: unknown[] = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", secrets: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ ORG_TOKEN: "t" }),
				},
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async (scope: unknown) => {
						scopesSeen.push(scope);
					},
				},
			}),
		});

		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			githubSecretKeys: ["ORG_TOKEN"],
			githubSecretScope: { kind: "organization", name: "theholocron" },
			loader,
			print: () => {},
		});

		expect(scopesSeen).toEqual([{ kind: "organization", name: "theholocron" }]);
		expect(report.summary.ok).toBe(1);
	});

	it("githubSecretScope: environment scope routes to the environment endpoint", async () => {
		const scopesSeen: unknown[] = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", secrets: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ ENV_TOKEN: "t" }),
				},
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async (scope: unknown) => {
						scopesSeen.push(scope);
					},
				},
			}),
		});

		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			githubSecretScope: { kind: "environment", name: "production" },
			loader,
			print: () => {},
		});

		expect(scopesSeen).toEqual([{ kind: "environment", name: "production" }]);
		expect(report.summary.ok).toBe(1);
	});

	it("soft-skips individual key failures (continues with other keys)", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", secrets: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ GOOD: "g", BAD: "b", ALSO_GOOD: "g2" }),
				},
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async (_scope: unknown, name: string) => {
						if (name === "BAD") throw new Error("403 forbidden");
					},
				},
			}),
		});

		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			loader,
			print: () => {},
		});

		expect(report.summary.ok).toBe(2);
		expect(report.summary.fail).toBe(1);
		const failedRow = report.rows.find((r) => r.status === "fail");
		expect(failedRow?.key).toBe("BAD");
		expect(failedRow?.message).toContain("403 forbidden");
	});

	describe("--worker", () => {
		const vaultPlugin = {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ COMLINK_SENTRY_SECRET: "shh" }),
				},
			}),
		};

		it("sets every vault key on the Worker as a secret, and nowhere else", async () => {
			const calls: Array<[string, string, string]> = [];
			const loaded = loadedFrom({ name: "comlink", providers: { vault: "1password", workers: "cloudflare" } });
			const loader = makeLoaderWith(loaded, {
				...vaultPlugin,
				"@theholocron/holocron-plugin-cloudflare": makePlugin("cf", {
					workers: {
						providerName: "cloudflare",
						setSecret: async (script: string, name: string, value: string) =>
							void calls.push([script, name, value]),
					},
				}),
			});
			const lines: string[] = [];
			const report = await runSecretsSync({
				loaded,
				context: { repoRoot: "/tmp/test" },
				environmentId: "prd",
				workerScript: "comlink",
				loader,
				print: (l) => lines.push(l),
			});
			expect(calls).toEqual([["comlink", "COMLINK_SENTRY_SECRET", "shh"]]);
			expect(report.summary.ok).toBe(1);
			expect(lines.join("\n")).not.toContain("shh");
		});

		it("previews in a dry run without setting anything", async () => {
			const setSecret = vi.fn();
			const loaded = loadedFrom({ name: "comlink", providers: { vault: "1password", workers: "cloudflare" } });
			const loader = makeLoaderWith(loaded, {
				...vaultPlugin,
				"@theholocron/holocron-plugin-cloudflare": makePlugin("cf", {
					workers: { providerName: "cloudflare", setSecret },
				}),
			});
			const report = await runSecretsSync({
				loaded,
				context: { repoRoot: "/tmp/test", dryRun: true },
				environmentId: "prd",
				workerScript: "comlink",
				loader,
				print: () => {},
			});
			expect(setSecret).not.toHaveBeenCalled();
			expect(report.summary.dryRun).toBe(1);
		});

		it("fails, naming the fix, with no workers provider or one that cannot set secrets", async () => {
			for (const withWorkers of [false, true]) {
				const loaded = loadedFrom({
					name: "comlink",
					providers: { vault: "1password", ...(withWorkers ? { workers: "cloudflare" } : {}) },
				});
				const loader = makeLoaderWith(loaded, {
					...vaultPlugin,
					...(withWorkers
						? {
								"@theholocron/holocron-plugin-cloudflare": makePlugin("cf", {
									workers: { providerName: "cloudflare" },
								}),
							}
						: {}),
				});
				const report = await runSecretsSync({
					loaded,
					context: { repoRoot: "/tmp/test" },
					environmentId: "prd",
					workerScript: "comlink",
					loader,
					print: () => {},
				});
				expect(report.summary.fail).toBe(1);
				expect(report.rows[0]!.message).toMatch(
					withWorkers ? /cannot set secrets/ : /needs a `workers` provider/
				);
			}
		});
	});

	it("prints, and reports as a failure, a vault environment that cannot be read", async () => {
		const loaded = loadedFrom({ name: "comlink", providers: { vault: "1password", workers: "cloudflare" } });
		const setSecret = vi.fn();
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "doppler",
					readEnvironment: async () => {
						throw new Error("Doppler GET /configs/config/secrets/download failed: 403");
					},
				},
			}),
			"@theholocron/holocron-plugin-cloudflare": makePlugin("cf", {
				workers: { providerName: "cloudflare", setSecret },
			}),
		});
		const lines: string[] = [];
		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "prd",
			workerScript: "comlink",
			loader,
			print: (l) => lines.push(l),
		});
		expect(report.summary).toEqual({ ok: 0, fail: 1, skip: 0, dryRun: 0 });
		expect(report.rows[0]).toMatchObject({ destination: "vault:doppler", status: "fail" });
		// It goes through the shared summary, so the failure row and the totals are printed too.
		expect(lines.join("\n")).toContain("0 ok, 1 fail, 0 skipped");
		expect(lines.join("\n")).toMatch(/could not read vault environment prd: .*403/);
		expect(setSecret).not.toHaveBeenCalled();
	});

	it("says why the workers provider is missing when its plugin failed to load", async () => {
		const loaded = loadedFrom({ name: "comlink", providers: { vault: "1password", workers: "cloudflare" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { providerName: "doppler", readEnvironment: async () => ({ K: "v" }) },
			}),
			"@theholocron/holocron-plugin-cloudflare": {
				createPlugin: () => {
					throw new Error("Cloudflare accountId is required");
				},
			},
		});
		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "prd",
			workerScript: "comlink",
			loader,
			print: () => {},
		});
		expect(report.rows[0]!.message).toMatch(/needs a `workers` provider.*failed to load.*accountId is required/);
	});
	describe("blank and missing values", () => {
		const everywhere = (readEnvironment: () => Promise<Record<string, string>>) => {
			const loaded = loadedFrom({
				name: "demo",
				providers: { vault: "1password", secrets: "github", deployment: "vercel", workers: "cloudflare" },
			});
			const secretCalls: string[] = [];
			const envCalls: string[] = [];
			const workerCalls: string[] = [];
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-1password": makePlugin("1p", {
					vault: { providerName: "1password", readEnvironment },
				}),
				"@theholocron/holocron-plugin-github": makePlugin("gh", {
					secrets: {
						providerName: "github",
						setSecret: async (_scope: unknown, name: string) => void secretCalls.push(name),
					},
				}),
				"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
					deployment: {
						providerName: "vercel",
						setEnvVar: async (_project: string, _target: string, name: string) => void envCalls.push(name),
					},
				}),
				"@theholocron/holocron-plugin-cloudflare": makePlugin("cf", {
					workers: {
						providerName: "cloudflare",
						setSecret: async (_script: string, name: string) => void workerCalls.push(name),
					},
				}),
			});
			return { loaded, loader, secretCalls, envCalls, workerCalls };
		};

		it("skips a blank value in every destination, in a dry run too, and never pushes it", async () => {
			for (const dryRun of [false, true]) {
				const t = everywhere(async () => ({ FILLED: "v", BLANK: "", SPACES: "  " }));
				const lines: string[] = [];
				const report = await runSecretsSync({
					loaded: t.loaded,
					context: { repoRoot: "/tmp/test", dryRun },
					environmentId: "env_1",
					projectId: "prj_1",
					targets: ["production"],
					workerScript: "w",
					loader: t.loader,
					print: (l) => lines.push(l),
				});
				expect([...t.secretCalls, ...t.envCalls, ...t.workerCalls]).toEqual(
					dryRun ? [] : ["FILLED", "FILLED", "FILLED"]
				);
				const skipped = report.rows.filter((r) => r.status === "skip");
				expect(skipped.map((r) => r.key).sort()).toEqual([
					"BLANK",
					"BLANK",
					"BLANK",
					"SPACES",
					"SPACES",
					"SPACES",
				]);
				expect(skipped.every((r) => r.message === "blank in the vault environment")).toBe(true);
				expect(report.summary.fail).toBe(0);
			}
		});

		it("skips a listed key the vault does not hold, and still pushes the rest", async () => {
			const t = everywhere(async () => ({ HERE: "v" }));
			const report = await runSecretsSync({
				loaded: t.loaded,
				context: { repoRoot: "/tmp/test" },
				environmentId: "env_1",
				githubSecretKeys: ["MISSING", "HERE"],
				loader: t.loader,
				print: () => {},
			});
			expect(t.secretCalls).toEqual(["HERE"]);
			expect(report.rows.find((r) => r.key === "MISSING")).toMatchObject({
				status: "skip",
				message: "not in the vault environment",
			});
		});
	});

	describe("secretRoutes", () => {
		it("pushes each route's keys at its own scope, one step per scope", async () => {
			const calls: Array<[unknown, string]> = [];
			const loaded = loadedFrom({ name: "demo", providers: { vault: "1password", secrets: "github" } });
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-1password": makePlugin("1p", {
					vault: {
						providerName: "1password",
						readEnvironment: async () => ({ ORG_ONE: "1", REPO_ONE: "2", UNLISTED: "3" }),
					},
				}),
				"@theholocron/holocron-plugin-github": makePlugin("gh", {
					secrets: {
						providerName: "github",
						setSecret: async (scope: unknown, name: string) => void calls.push([scope, name]),
					},
				}),
			});
			const lines: string[] = [];
			const report = await runSecretsSync({
				loaded,
				context: { repoRoot: "/tmp/test" },
				environmentId: "CI",
				secretRoutes: [
					{ scope: { kind: "organization", name: "theholocron" }, keys: ["ORG_ONE"] },
					{ scope: { kind: "repo" }, keys: ["REPO_ONE"] },
				],
				loader,
				print: (l) => lines.push(l),
			});
			expect(calls).toEqual([
				[{ kind: "organization", name: "theholocron" }, "ORG_ONE"],
				[{ kind: "repo" }, "REPO_ONE"],
			]);
			expect(report.summary.ok).toBe(2);
			const out = lines.join("\n");
			expect(out).toContain("secrets (scope=organization,org=theholocron)");
			expect(out).toContain("secrets (scope=repo)");
		});
	});

	describe("variableRoutes", () => {
		interface Doubles {
			secrets: string[];
			deployments: string[];
			repoVars: Array<Record<string, string>>;
			orgVars: Array<[string, Record<string, { value: string; visibility: string }>]>;
			loaded: LoadedConfig;
			loader: PluginLoader;
		}

		function doubles(
			values: Record<string, string>,
			source: Record<string, unknown> | null = {},
			withDeployment = false
		): Doubles {
			const d = { secrets: [], deployments: [], repoVars: [], orgVars: [] } as unknown as Doubles;
			const providers: Record<string, string> = { vault: "1password", secrets: "github" };
			if (source) providers["source"] = "github";
			if (withDeployment) providers["deployment"] = "vercel";
			d.loaded = loadedFrom({ name: "demo", providers });
			const github = {
				...(source
					? {
							source: {
								providerName: "github",
								syncVariables: async (v: Record<string, string>) => {
									d.repoVars.push(v);
									return "ok";
								},
								syncOrgVariables: async (
									org: string,
									v: Record<string, { value: string; visibility: string }>
								) => {
									d.orgVars.push([org, v]);
									return "ok";
								},
								...source,
							},
						}
					: {}),
				secrets: {
					providerName: "github",
					setSecret: async (_s: unknown, name: string) => void d.secrets.push(name),
				},
			};
			d.loader = makeLoaderWith(d.loaded, {
				"@theholocron/holocron-plugin-1password": makePlugin("1p", {
					vault: { providerName: "1password", readEnvironment: async () => values },
				}),
				"@theholocron/holocron-plugin-github": makePlugin("gh", github),
				"@theholocron/holocron-plugin-vercel": makePlugin("vc", {
					deployment: {
						providerName: "vercel",
						setEnvVar: async (_p: string, _t: string, key: string) => void d.deployments.push(key),
					},
				}),
			});
			return d;
		}

		const run = (d: Doubles, extra: Partial<Parameters<typeof runSecretsSync>[0]> = {}) => {
			const lines: string[] = [];
			return runSecretsSync({
				loaded: d.loaded,
				context: { repoRoot: "/tmp/test" },
				environmentId: "Vars",
				secretRoutes: [],
				variableRoutes: [
					{ scope: { kind: "organization", name: "theholocron" }, keys: ["TURBO_TEAM", "BLANK", "ABSENT"] },
				],
				loader: d.loader,
				print: (l) => lines.push(l),
				...extra,
			}).then((report) => ({ report, out: lines.join("\n") }));
		};

		it("writes variables, not secrets, and skips a blank or missing value", async () => {
			const d = doubles({ TURBO_TEAM: "iamnewton", BLANK: "  ", OTHER: "x" }, {}, true);
			const { report, out } = await run(d);
			expect(d.orgVars).toEqual([["theholocron", { TURBO_TEAM: { value: "iamnewton", visibility: "all" } }]]);
			expect(d.repoVars).toEqual([]);
			expect(d.secrets).toEqual([]);
			expect(d.deployments).toEqual([]);
			expect(report.rows.map((r) => [r.key, r.status])).toEqual([
				["TURBO_TEAM", "ok"],
				["BLANK", "skip"],
				["ABSENT", "skip"],
			]);
			expect(out).toContain("variables (scope=organization,org=theholocron)");
			expect(out).not.toContain("projectId");
			expect(report.rows.every((r) => r.destination === "variables:github")).toBe(true);
		});

		it("writes a repository route through syncVariables, and an organization one with its visibility", async () => {
			const d = doubles({ A: "1", B: "2" });
			await run(d, {
				variableRoutes: [
					{ scope: { kind: "repo" }, keys: ["A"] },
					{ scope: { kind: "organization", name: "o" }, keys: ["B"], visibility: "private" },
				],
			});
			expect(d.repoVars).toEqual([{ A: "1" }]);
			expect(d.orgVars).toEqual([["o", { B: { value: "2", visibility: "private" } }]]);
		});

		it("writes nothing on a dry run, and never prints a value", async () => {
			const d = doubles({ TURBO_TEAM: "super-visible-value-123" });
			const { report, out } = await run(d, { context: { repoRoot: "/tmp/test", dryRun: true } });
			expect(d.orgVars).toEqual([]);
			expect(report.rows[0]).toMatchObject({ key: "TURBO_TEAM", status: "dry-run" });
			expect(out).not.toContain("super-visible-value-123");
			expect(JSON.stringify(report)).not.toContain("super-visible-value-123");
		});

		it("also pushes a secrets route the same environment declares", async () => {
			const d = doubles({ TURBO_TEAM: "t", S: "s" });
			await run(d, { secretRoutes: [{ scope: { kind: "repo" }, keys: ["S"] }] });
			expect(d.secrets).toEqual(["S"]);
			expect(d.orgVars).toHaveLength(1);
		});

		it("fails one row per route when the source is missing or cannot write variables", async () => {
			const none = await run(doubles({ TURBO_TEAM: "t" }, null));
			expect(none.report.rows).toEqual([expect.objectContaining({ key: "(all)", status: "fail" })]);
			expect(none.report.rows[0]!.message).toMatch(/needs a `source` provider/);

			const noOrg = await run(doubles({ A: "1" }, { syncOrgVariables: undefined }));
			expect(noOrg.report.rows[0]!.message).toMatch(/does not implement syncOrgVariables/);

			const noRepo = await run(doubles({ A: "1" }, { syncVariables: undefined }), {
				variableRoutes: [{ scope: { kind: "repo" }, keys: ["A"] }],
			});
			expect(noRepo.report.rows[0]!.message).toMatch(/does not implement syncVariables/);
		});

		it("makes a provider failure one failed row", async () => {
			const d = doubles(
				{ TURBO_TEAM: "t" },
				{
					syncOrgVariables: async () => {
						throw new Error("403");
					},
				}
			);
			const { report } = await run(d);
			expect(report.rows[0]).toMatchObject({ key: "TURBO_TEAM", status: "fail", message: "403" });
		});
	});
});
