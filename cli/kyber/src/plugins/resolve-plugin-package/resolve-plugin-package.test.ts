import { describe, expect, it } from "vitest";

import { resolvePluginPackage } from "./resolve-plugin-package.js";

describe("resolvePluginPackage", () => {
	it("prefixes a short name", () => {
		expect(resolvePluginPackage("github", "@acme/cli-plugin-")).toBe("@acme/cli-plugin-github");
	});

	it("keeps scoped names, names with a slash and names with the community prefix as they are", () => {
		expect(resolvePluginPackage("@other/thing", "@acme/cli-plugin-", "cli-plugin-")).toBe("@other/thing");
		expect(resolvePluginPackage("owner/thing", "@acme/cli-plugin-")).toBe("owner/thing");
		expect(resolvePluginPackage("cli-plugin-x", "@acme/cli-plugin-", "cli-plugin-")).toBe("cli-plugin-x");
	});

	it("prefixes a name that looks like the community prefix when none is given", () => {
		expect(resolvePluginPackage("cli-plugin-x", "@acme/cli-plugin-")).toBe("@acme/cli-plugin-cli-plugin-x");
	});

	it("throws on an empty name", () => {
		expect(() => resolvePluginPackage("", "@acme/cli-plugin-")).toThrow(/empty/);
	});
});
