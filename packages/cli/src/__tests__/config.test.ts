import { describe, expect, it } from "vitest";

import { ConfigError, resolveConfig, resolveEntry, resolvePluginPackage } from "../config.js";

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
});
