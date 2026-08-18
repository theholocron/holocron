import { describe, expect, it } from "vitest";
import { defineConfig, type DevmojiConfig } from "./index.js";

describe("defineConfig()", () => {
	it("returns a valid DevmojiConfig", () => {
		const config: DevmojiConfig = defineConfig();
		expect(config).toBeDefined();
	});

	it("includes lint as an accepted type by default", () => {
		expect(defineConfig().types).toContain("lint");
	});

	it("maps feat to boom emoji by default", () => {
		const feat = defineConfig().devmoji?.find((e) => e.code === "feat");
		expect(feat?.emoji).toBe("boom");
	});

	it("maps fail to poop emoji with a description", () => {
		const fail = defineConfig().devmoji?.find((e) => e.code === "fail");
		expect(fail?.emoji).toBe("poop");
		expect(fail?.description).toBeTruthy();
	});

	it("maps config to gear emoji via gitmoji wrench", () => {
		const cfg = defineConfig().devmoji?.find((e) => e.code === "config");
		expect(cfg?.gitmoji).toBe("wrench");
		expect(cfg?.emoji).toBe("gear");
	});

	it("merges extra types with defaults", () => {
		const config = defineConfig({ types: ["wip"] });
		expect(config.types).toContain("lint");
		expect(config.types).toContain("wip");
	});

	it("appends override devmoji entries after defaults", () => {
		const config = defineConfig({ devmoji: [{ code: "custom", emoji: "rocket" }] });
		expect(config.devmoji?.find((e) => e.code === "feat")).toBeDefined();
		expect(config.devmoji?.find((e) => e.code === "custom")?.emoji).toBe("rocket");
	});
});
