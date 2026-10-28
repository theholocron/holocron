import { describe, expect, it } from "vitest";

import { createTsconfig } from "./tsconfig.js";

describe("createTsconfig", () => {
	it("sets display from the given option", () => {
		const config = JSON.parse(createTsconfig({ display: "@theholocron/example" })) as { display: string };
		expect(config.display).toBe("@theholocron/example");
	});

	it("defaults to the node-lts variant", () => {
		const config = JSON.parse(createTsconfig({ display: "x" })) as { extends: string };
		expect(config.extends).toBe("@theholocron/tsconfig/node-lts");
	});

	it("honors an explicit variant", () => {
		const config = JSON.parse(createTsconfig({ display: "x", variant: "react" })) as { extends: string };
		expect(config.extends).toBe("@theholocron/tsconfig/react");
	});

	it("sets the uniform baseUrl/outDir compilerOptions", () => {
		const config = JSON.parse(createTsconfig({ display: "x" })) as {
			compilerOptions: { baseUrl: string; outDir: string };
		};
		expect(config.compilerOptions.baseUrl).toBe("./");
		expect(config.compilerOptions.outDir).toBe("./dist");
	});

	it("omits paths by default", () => {
		const config = JSON.parse(createTsconfig({ display: "x" })) as { compilerOptions: Record<string, unknown> };
		expect(config.compilerOptions.paths).toBeUndefined();
	});

	it("adds a @/* path alias when paths: true", () => {
		const config = JSON.parse(createTsconfig({ display: "x", paths: true })) as {
			compilerOptions: { paths: Record<string, string[]> };
		};
		expect(config.compilerOptions.paths).toEqual({ "@/*": ["./src/*"] });
	});

	it("sets the uniform include/exclude", () => {
		const config = JSON.parse(createTsconfig({ display: "x" })) as { include: string[]; exclude: string[] };
		expect(config.include).toEqual(["src/**/*.ts"]);
		expect(config.exclude).toEqual(["node_modules", "dist"]);
	});

	it("never sets module/moduleResolution/rootDir — genuine per-package deviations, not defaults", () => {
		const config = JSON.parse(createTsconfig({ display: "x", paths: true })) as {
			compilerOptions: Record<string, unknown>;
		};
		expect(config.compilerOptions.module).toBeUndefined();
		expect(config.compilerOptions.moduleResolution).toBeUndefined();
		expect(config.compilerOptions.rootDir).toBeUndefined();
	});

	it("produces valid JSON ending in a trailing newline", () => {
		const out = createTsconfig({ display: "x" });
		expect(out.endsWith("\n")).toBe(true);
		expect(() => JSON.parse(out)).not.toThrow();
	});

	it("has no scaffold/workflow header — matches .alexrc.json's strict-JSON precedent", () => {
		const out = createTsconfig({ display: "x" });
		expect(out.startsWith("{")).toBe(true);
	});
});
