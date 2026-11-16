import { describe, expect, it } from "vitest";

import type { PluginImporter } from "../loader/loader.type.js";
import { hintingImporter, missingPluginHint } from "./missing-plugin-hint.js";

const PACKAGE = "@theholocron/holocron-plugin-codecov";

describe("hintingImporter()", () => {
	it("names the package and the catalog to add it to when it does not resolve", async () => {
		const base: PluginImporter = async () => {
			throw new Error(`Cannot find package '${PACKAGE}' imported from /repo`);
		};
		const err = await hintingImporter(base)(PACKAGE).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		const message = (err as Error).message;
		expect(message).toContain(PACKAGE);
		expect(message).toContain("catalogs.holocron");
		expect(message).toContain("pnpm-workspace.yaml");
		expect(message).toBe(`Cannot find package '${PACKAGE}' imported from /repo\n${missingPluginHint(PACKAGE)}`);
	});

	it("leaves a failure of the plugin's own dependency alone", async () => {
		const base: PluginImporter = async () => {
			throw new Error("Cannot find package 'tslib' imported from /repo");
		};
		const err = await hintingImporter(base)(PACKAGE).catch((e: unknown) => e);
		expect((err as Error).message).toBe("Cannot find package 'tslib' imported from /repo");
	});

	it("returns the module when it resolves", async () => {
		const mod = { createPlugin: () => ({}) } as unknown as Awaited<ReturnType<PluginImporter>>;
		expect(await hintingImporter(async () => mod)(PACKAGE)).toBe(mod);
	});
});
