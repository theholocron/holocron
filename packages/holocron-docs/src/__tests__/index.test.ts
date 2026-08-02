import { describe, expect, it } from "vitest";

import config, { type DocsConfig, type SidebarGroup, type SidebarLink } from "../index.js";

describe("DocsConfig", () => {
	it("exports a config with the correct slug, parent, and name", () => {
		expect(config.slug).toBe("holocron");
		expect(config.parent).toBeNull();
		expect(config.name).toBe("Holocron");
	});

	it("sidebar is a non-empty array", () => {
		expect(Array.isArray(config.sidebar)).toBe(true);
		expect(config.sidebar.length).toBeGreaterThan(0);
	});

	it("sidebar contains top-level links and groups", () => {
		const links = config.sidebar.filter((e): e is SidebarLink => "slug" in e);
		const groups = config.sidebar.filter((e): e is SidebarGroup => "items" in e);
		expect(links.length).toBeGreaterThan(0);
		expect(groups.length).toBeGreaterThan(0);
	});

	it("Commands group contains a setup entry", () => {
		const commandsGroup = config.sidebar.find(
			(e): e is SidebarGroup => "items" in e && e.label === "Commands",
		);
		expect(commandsGroup).toBeDefined();
		const setup = commandsGroup!.items.find(
			(e): e is SidebarLink => "slug" in e && e.label === "setup",
		);
		expect(setup?.slug).toBe("holocron/commands/setup");
	});

	it("Plugins group lists expected providers", () => {
		const pluginsGroup = config.sidebar.find(
			(e): e is SidebarGroup => "items" in e && e.label === "Plugins",
		);
		expect(pluginsGroup).toBeDefined();
		const labels = pluginsGroup!.items
			.filter((e): e is SidebarLink => "slug" in e)
			.map((e) => e.label);
		expect(labels).toContain("Doppler");
		expect(labels).toContain("GitHub");
	});

	it("satisfies the DocsConfig type shape", () => {
		const typed: DocsConfig = config;
		expect(typeof typed.slug).toBe("string");
		expect(typeof typed.name).toBe("string");
	});
});
