import { describe, expect, it } from "vitest";

import { ConfigError, credentialsEnvironment, resolveConfig, resolveEntry, resolvePluginPackage } from "./config.js";

describe("resolvePluginPackage", () => {
	it("expands a short name to the @theholocron-scoped plugin package", () => {
		expect(resolvePluginPackage("github")).toBe("@theholocron/holocron-plugin-github");
	});
	it("honors a fully-scoped name verbatim", () => {
		expect(resolvePluginPackage("@my-org/holocron-plugin-x")).toBe("@my-org/holocron-plugin-x");
	});
	it("honors a community holocron-plugin-* name verbatim", () => {
		expect(resolvePluginPackage("holocron-plugin-x")).toBe("holocron-plugin-x");
	});
	it("throws on an empty provider name", () => {
		expect(() => resolvePluginPackage("")).toThrow(ConfigError);
	});
});

describe("resolveEntry — single-cardinality capabilities", () => {
	it("parses the short string form", () => {
		const result = resolveEntry("source", "github");
		expect(result).toMatchObject({
			cardinality: "single",
			tuple: {
				provider: "github",
				packageName: "@theholocron/holocron-plugin-github",
				options: {},
			},
		});
	});

	it("parses the tuple form with options", () => {
		const result = resolveEntry("deployment", ["vercel", { team: "rando" }]);
		expect(result).toMatchObject({
			cardinality: "single",
			tuple: {
				provider: "vercel",
				packageName: "@theholocron/holocron-plugin-vercel",
				options: { team: "rando" },
			},
		});
	});

	it("errors when a multi-list is supplied for a single-cardinality capability", () => {
		expect(() => resolveEntry("source", ["github", "gitlab"])).toThrow(ConfigError);
	});
});

describe("resolveEntry — many-cardinality capabilities", () => {
	it("parses an array of short strings", () => {
		const result = resolveEntry("notifications", ["slack", "discord"]);
		expect(result).toEqual({
			cardinality: "many",
			tuples: [
				{ provider: "slack", packageName: "@theholocron/holocron-plugin-slack", options: {} },
				{ provider: "discord", packageName: "@theholocron/holocron-plugin-discord", options: {} },
			],
		});
	});

	it("parses an array of tuples", () => {
		const result = resolveEntry("notifications", [
			["slack", { channel: "#ops" }],
			["discord", { webhook: "env:HOOK" }],
		]);
		expect(result.cardinality).toBe("many");
		if (result.cardinality !== "many") throw new Error("unreachable");
		expect(result.tuples).toHaveLength(2);
		expect(result.tuples[0]).toMatchObject({ provider: "slack", options: { channel: "#ops" } });
		expect(result.tuples[1]).toMatchObject({ provider: "discord", options: { webhook: "env:HOOK" } });
	});

	it("promotes a single tuple to a one-element list", () => {
		const result = resolveEntry("notifications", ["slack", { channel: "#ops" }]);
		expect(result.cardinality).toBe("many");
	});

	it("errors when a short string is supplied for a many-cardinality capability", () => {
		expect(() => resolveEntry("notifications", "slack")).toThrow(ConfigError);
	});

	it("errors when entry is neither a string nor an array", () => {
		// @ts-expect-error — deliberately passing invalid type
		expect(() => resolveEntry("notifications", 42)).toThrow(ConfigError);
	});

	it("errors when an array element is not a string or valid options tuple", () => {
		// @ts-expect-error — deliberately passing invalid element type
		expect(() => resolveEntry("notifications", [{ notAProvider: true }])).toThrow(ConfigError);
	});
});

describe("resolveConfig", () => {
	const minimal = {
		name: "demo",
		providers: {
			vault: "1password" as const,
		},
	};

	it("requires name", () => {
		expect(() => resolveConfig({ ...minimal, name: "" })).toThrow(ConfigError);
	});

	it("requires the providers block", () => {
		// @ts-expect-error — deliberately omitting required field
		expect(() => resolveConfig({ name: "x" })).toThrow(ConfigError);
	});

	it("accepts config without vault (vault is no longer required)", () => {
		expect(() => resolveConfig({ name: "demo", providers: { source: "github" } })).not.toThrow();
	});

	it("returns a normalized config with defaults filled in", () => {
		const resolved = resolveConfig(minimal);
		expect(resolved.name).toBe("demo");
		expect(resolved.providers.vault?.cardinality).toBe("single");
		expect(resolved.apps).toEqual([]);
		expect(resolved.doctor).toEqual({});
	});

	it("docs is undefined when not set", () => {
		expect(resolveConfig(minimal).docs).toBeUndefined();
	});

	it("passes the log config through", () => {
		expect(resolveConfig(minimal).log).toBeUndefined();
		expect(resolveConfig({ ...minimal, log: { level: "debug" } }).log).toEqual({ level: "debug" });
	});

	it("passes the log.axiom.dataset opt-in through", () => {
		expect(resolveConfig({ ...minimal, log: { axiom: { dataset: "repo-ds" } } }).log).toEqual({
			axiom: { dataset: "repo-ds" },
		});
	});

	it("passes the telemetry config block through", () => {
		expect(resolveConfig(minimal).telemetry).toBeUndefined();
		expect(resolveConfig({ ...minimal, telemetry: { enabled: false } }).telemetry).toEqual({ enabled: false });
		expect(resolveConfig({ ...minimal, telemetry: { analytics: "none" } }).telemetry).toEqual({
			analytics: "none",
		});
	});

	it("passes syncScripts and holocronScript through", () => {
		expect(resolveConfig(minimal).syncScripts).toBeUndefined();
		expect(resolveConfig(minimal).holocronScript).toBeUndefined();
		const resolved = resolveConfig({
			...minimal,
			syncScripts: false,
			holocronScript: "node packages/cli/dist/cli.mjs",
		});
		expect(resolved.syncScripts).toBe(false);
		expect(resolved.holocronScript).toBe("node packages/cli/dist/cli.mjs");
	});

	it("passes extraRequiredChecks and required task entries through", () => {
		expect(resolveConfig(minimal).extraRequiredChecks).toBeUndefined();
		const resolved = resolveConfig({
			...minimal,
			extraRequiredChecks: ["codecov/patch", "tsdown (every workspace)"],
			tasks: [{ name: "lint", required: true }, "test"],
		});
		expect(resolved.extraRequiredChecks).toEqual(["codecov/patch", "tsdown (every workspace)"]);
		expect(resolved.tasks).toEqual([{ name: "lint", required: true }, "test"]);
	});

	it("throws when docs is set but build is absent", () => {
		expect(() => resolveConfig({ ...minimal, docs: {} })).toThrow(ConfigError);
		expect(() => resolveConfig({ ...minimal, docs: {} })).toThrow("`docs.build` is required");
	});

	it("resolves docs: { build: 'workflow' }", () => {
		const resolved = resolveConfig({ ...minimal, docs: { build: "workflow" } });
		expect(resolved.docs).toEqual({ build: "workflow" });
	});

	it("resolves docs with all fields", () => {
		const resolved = resolveConfig({
			...minimal,
			docs: { build: "workflow", domain: "docs.theholocron.dev", https: true },
		});
		expect(resolved.docs).toEqual({
			build: "workflow",
			domain: "docs.theholocron.dev",
			https: true,
		});
	});

	it("derives homepage from docs.domain when homepage is not explicitly set", () => {
		const resolved = resolveConfig({
			...minimal,
			docs: { build: "workflow", domain: "docs.theholocron.dev" },
		});
		expect(resolved.homepage).toBe("https://docs.theholocron.dev/");
	});

	it("explicit homepage takes precedence over docs.domain derivation", () => {
		const resolved = resolveConfig({
			...minimal,
			homepage: "https://theholocron.dev/",
			docs: { build: "workflow", domain: "docs.theholocron.dev" },
		});
		expect(resolved.homepage).toBe("https://theholocron.dev/");
	});

	it("homepage is undefined when neither homepage nor docs.domain is set", () => {
		expect(resolveConfig(minimal).homepage).toBeUndefined();
	});

	it("passes repoValidation.docsCoverage through, and leaves it unset by default", () => {
		for (const docsCoverage of ["off", "warn", "required"] as const) {
			expect(resolveConfig({ ...minimal, repoValidation: { docsCoverage } }).repoValidation).toEqual({
				docsCoverage,
			});
		}
		expect(resolveConfig(minimal).repoValidation).toBeUndefined();
		expect(resolveConfig({ ...minimal, repoValidation: {} }).repoValidation).toEqual({});
	});

	it("passes the credentials environment through, and leaves it unset by default", () => {
		expect(resolveConfig({ ...minimal, credentials: { environment: "Holocron" } }).credentials).toEqual({
			environment: "Holocron",
		});
		expect(resolveConfig(minimal).credentials).toBeUndefined();
	});

	it("passes the dev block through, and leaves it unset by default", () => {
		const dev = {
			environment: "Sentinel - dev",
			tunnel: { name: "sentinel-dev", hostname: "sentinel-dev.theholocron.dev" },
			port: 3000,
			command: ["pnpm", "run", "serve"],
		};
		expect(resolveConfig({ ...minimal, dev }).dev).toEqual(dev);
		expect(resolveConfig({ ...minimal, dev: {} }).dev).toEqual({});
		const serve = {
			handler: "./h.ts",
			export: "handle",
			required: ["A"],
			logging: { tokenVar: "T", datasetVar: "D" },
		};
		expect(resolveConfig({ ...minimal, dev: { serve } }).dev).toEqual({ serve });
		expect(resolveConfig(minimal).dev).toBeUndefined();
	});

	it("passes the githubApps list through, and leaves it unset by default", () => {
		const githubApps = [{ name: "Sentinel", manifest: "m.json", environment: "Sentinel" }];
		expect(resolveConfig({ ...minimal, githubApps }).githubApps).toEqual(githubApps);
		expect(resolveConfig(minimal).githubApps).toBeUndefined();
	});

	it.each([
		["a list that is not a list", {}, /githubApps. must be a list/],
		["an entry that is not an object", [null], /githubApps\[0\]\.name/],
		["an empty name", [{ name: " ", manifest: "m", environment: "e" }], /githubApps\[0\]\.name/],
		["no manifest", [{ name: "n", environment: "e" }], /githubApps\[0\]\.manifest/],
		["no environment", [{ name: "n", manifest: "m", environment: "" }], /githubApps\[0\]\.environment/],
	])("rejects githubApps with %s", (_label, githubApps, message) => {
		expect(() => resolveConfig({ ...minimal, githubApps: githubApps as never })).toThrow(message);
	});

	it("passes the ideas block through, and leaves it unset by default", () => {
		const ideas = { dir: "~/vault", states: { file: "queued" } };
		expect(resolveConfig({ ...minimal, ideas }).ideas).toEqual(ideas);
		expect(resolveConfig({ ...minimal, ideas: { dir: "/v" } }).ideas).toEqual({ dir: "/v" });
		expect(resolveConfig(minimal).ideas).toBeUndefined();
		expect(resolveConfig({ ...minimal, ideas: { states: { file: "queued" } } }).ideas).toEqual({
			states: { file: "queued" },
		});
		expect(resolveConfig({ ...minimal, ideas: {} }).ideas).toEqual({});
	});

	it.each([
		["a value that is not an object", "~/vault", /`ideas` must be an object/],
		["a list", [], /`ideas` must be an object/],
		["an empty dir", { dir: " " }, /ideas\.dir/],
		["a non-string dir", { dir: 3 }, /ideas\.dir/],
		["states that are not an object", { dir: "/v", states: "x" }, /ideas\.states. must be an object/],
		["an empty filing state", { dir: "/v", states: { file: "" } }, /ideas\.states\.file/],
	])("rejects ideas with %s", (_label, ideas, message) => {
		expect(() => resolveConfig({ ...minimal, ideas: ideas as never })).toThrow(message);
	});

	it.each([
		["an empty environment", { environment: " " }, /dev\.environment/],
		["an empty tunnel name", { tunnel: { name: "", hostname: "a.example.dev" } }, /dev\.tunnel\.name/],
		[
			"a hostname with a scheme",
			{ tunnel: { name: "n", hostname: "https://a.example.dev" } },
			/dev\.tunnel\.hostname/,
		],
		["a hostname with one label", { tunnel: { name: "n", hostname: "localhost" } }, /dev\.tunnel\.hostname/],
		["a hostname that is not a string", { tunnel: { name: "n", hostname: 5 as never } }, /dev\.tunnel\.hostname/],
		["a port of zero", { port: 0 }, /dev\.port/],
		["a port above 65535", { port: 70000 }, /dev\.port/],
		["a port that is not whole", { port: 3000.5 }, /dev\.port/],
		["an empty command", { command: [] }, /dev\.command/],
		["a command with an empty part", { command: ["pnpm", ""] }, /dev\.command/],
		["a serve block with no handler", { serve: { handler: " " } }, /dev\.serve\.handler/],
		["an empty serve export", { serve: { handler: "./h.ts", export: "" } }, /dev\.serve\.export/],
		[
			"serve.required that is not a list of names",
			{ serve: { handler: "./h.ts", required: ["A", ""] } },
			/dev\.serve\.required/,
		],
		[
			"serve.required that is not a list",
			{ serve: { handler: "./h.ts", required: "A" as never } },
			/dev\.serve\.required/,
		],
		[
			"serve.logging with no token variable",
			{ serve: { handler: "./h.ts", logging: { tokenVar: "", datasetVar: "D" } } },
			/dev\.serve\.logging/,
		],
		[
			"serve.logging with no dataset variable",
			{ serve: { handler: "./h.ts", logging: { tokenVar: "T", datasetVar: "" } } },
			/dev\.serve\.logging/,
		],
	])("rejects a dev block with %s", (_label, dev, message) => {
		expect(() => resolveConfig({ ...minimal, dev })).toThrow(message);
	});

	it("accepts a credentials provider when the environment is named", () => {
		const resolved = resolveConfig({
			...minimal,
			providers: { ...minimal.providers, credentials: ["1password"] },
			credentials: { environment: "Holocron" },
		});
		expect(resolved.providers.credentials).toMatchObject({ cardinality: "many" });
	});

	it("rejects a credentials provider with no environment to read", () => {
		const err = (() => {
			try {
				resolveConfig({ ...minimal, providers: { ...minimal.providers, credentials: ["doppler"] } });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/credentials\.environment/);
	});

	it("accepts a credentials provider that names its own environment, with no shared one", () => {
		const resolved = resolveConfig({
			...minimal,
			providers: { ...minimal.providers, credentials: [["1password", { environment: "Holocron" }]] },
		});
		const entry = resolved.providers.credentials;
		expect(entry?.cardinality === "many" && credentialsEnvironment(entry.tuples[0]!, resolved)).toBe("Holocron");
	});

	it("rejects an empty environment option on a credentials provider", () => {
		const err = (() => {
			try {
				resolveConfig({
					...minimal,
					providers: { ...minimal.providers, credentials: [["1password", { environment: " " }]] },
					credentials: { environment: "Holocron" },
				});
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/1password.*environment.*empty/);
	});

	it("names the provider that has no environment to read", () => {
		const err = (() => {
			try {
				resolveConfig({ ...minimal, providers: { ...minimal.providers, credentials: ["doppler"] } });
			} catch (e) {
				return e;
			}
		})();
		expect((err as Error).message).toMatch(/`doppler` credentials provider has no environment/);
	});

	it("rejects an empty credentials environment", () => {
		const err = (() => {
			try {
				resolveConfig({ ...minimal, credentials: { environment: "  " } });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/empty/);
	});

	it("rejects a docsCoverage value that is not off, warn or required", () => {
		const err = (() => {
			try {
				resolveConfig({ ...minimal, repoValidation: { docsCoverage: "strict" as never } });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as ConfigError).message).toMatch(
			/repoValidation\.docsCoverage.*"off", "warn", "required".*"strict"/
		);
	});
});

describe("credentialsEnvironment", () => {
	const tuple = (options: Record<string, unknown>) => ({ provider: "1password", packageName: "p", options });

	it("is the provider's own environment option when it has one", () => {
		expect(credentialsEnvironment(tuple({ environment: "Own" }), { credentials: { environment: "Shared" } })).toBe(
			"Own"
		);
	});

	it("is the shared environment otherwise, or when the option is empty", () => {
		expect(credentialsEnvironment(tuple({}), { credentials: { environment: "Shared" } })).toBe("Shared");
		expect(credentialsEnvironment(tuple({ environment: " " }), { credentials: { environment: "Shared" } })).toBe(
			"Shared"
		);
	});

	it("is undefined when neither is set", () => {
		expect(credentialsEnvironment(tuple({}), {})).toBeUndefined();
	});
});
