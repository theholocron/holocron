import { describe, expect, it } from "vitest";

import { resolveConfig } from "../../../config/index.js";
import { resolveIdeasProvider } from "./resolve-ideas-provider.js";

const minimal = { name: "x", providers: {} };

describe("resolveIdeasProvider", () => {
	it("is the config's providers.ideas entry as written", () => {
		const resolved = resolveConfig({ ...minimal, providers: { ideas: ["obsidian", { dir: "~/Vault" }] } });
		expect(resolveIdeasProvider(resolved, {})).toEqual({
			cardinality: "single",
			tuple: {
				provider: "obsidian",
				packageName: "@theholocron/holocron-plugin-obsidian",
				options: { dir: "~/Vault" },
			},
		});
	});

	it("reads a config with only the legacy ideas.dir as the obsidian provider with that dir", () => {
		const resolved = resolveConfig({ ...minimal, ideas: { dir: "~/Legacy", states: { file: "queued" } } });
		expect(resolved.providers.ideas).toBeUndefined();
		expect(resolveIdeasProvider(resolved, {})).toEqual({
			cardinality: "single",
			tuple: {
				provider: "obsidian",
				packageName: "@theholocron/holocron-plugin-obsidian",
				options: { dir: "~/Legacy" },
			},
		});
	});

	it("lets providers.ideas win over ideas.dir", () => {
		const resolved = resolveConfig({
			...minimal,
			providers: { ideas: ["obsidian", { dir: "/new" }] },
			ideas: { dir: "/old" },
		});
		const entry = resolveIdeasProvider(resolved, {});
		expect(entry).toMatchObject({ tuple: { options: { dir: "/new" } } });
	});

	it("falls back to the obsidian provider with no options when only HOLOCRON_IDEAS_DIR is set", () => {
		const resolved = resolveConfig(minimal);
		expect(resolveIdeasProvider(resolved, { HOLOCRON_IDEAS_DIR: "/v" })).toMatchObject({
			tuple: { provider: "obsidian", options: {} },
		});
		expect(resolveIdeasProvider(resolved, { IDEAS_DIR: "/v" })).toMatchObject({ tuple: { options: {} } });
	});

	it("is undefined when the config names no place for ideas, so a config without the capability is unaffected", () => {
		expect(resolveIdeasProvider(resolveConfig(minimal), {})).toBeUndefined();
		expect(
			resolveIdeasProvider(resolveConfig({ ...minimal, ideas: { states: { file: "q" } } }), {})
		).toBeUndefined();
	});

	it("takes a third-party ideas provider as written", () => {
		const resolved = resolveConfig({ ...minimal, providers: { ideas: "notion" } });
		expect(resolveIdeasProvider(resolved, {})).toMatchObject({ tuple: { provider: "notion" } });
	});
});
