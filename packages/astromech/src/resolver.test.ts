import { describe, expect, it } from "vitest";

import { RESOLVABLE_TOOLS, resolveToolConfig } from "./resolver.js";

const CWD = "/repo";

/** Build injectable fs helpers from a flat file map (paths relative to CWD). */
function makeFs(files: Record<string, string>) {
	const rel = (p: string) => (p === CWD ? "" : p.startsWith(CWD + "/") ? p.slice(CWD.length + 1) : p);
	return {
		readFile: (p: string): string => {
			const c = files[rel(p)];
			if (c === undefined) throw new Error(`ENOENT: ${p}`);
			return c;
		},
		fileExists: (p: string): boolean => files[rel(p)] !== undefined,
	};
}

/** A `package.json#exports` map shaped like every real `@theholocron/*-config` package. */
const exportsMap = (subpath: string, relativeFile: string) => ({
	exports: {
		[subpath]: {
			types: relativeFile.replace(/\.js$/, ".d.ts"),
			import: relativeFile,
			default: relativeFile,
		},
	},
});

describe("resolveToolConfig", () => {
	it("returns [] for a tool with no known resolver mapping", () => {
		expect(resolveToolConfig("gitleaks", CWD, makeFs({}))).toEqual([]);
		expect(resolveToolConfig("yamllint", CWD, makeFs({}))).toEqual([]);
	});

	it("returns [] when the shared package isn't installed", () => {
		expect(resolveToolConfig("eslint", CWD, makeFs({}))).toEqual([]);
	});

	it("returns [] when package.json has no exports field", () => {
		const files = {
			"node_modules/@theholocron/eslint-config/package.json": JSON.stringify({ name: "x" }),
		};
		expect(resolveToolConfig("eslint", CWD, makeFs(files))).toEqual([]);
	});

	it("returns [] when package.json is invalid JSON", () => {
		const files = {
			"node_modules/@theholocron/eslint-config/package.json": "{not json",
		};
		expect(resolveToolConfig("eslint", CWD, makeFs(files))).toEqual([]);
	});

	it("returns [] when the exports map has no entry for the expected subpath", () => {
		const files = {
			"node_modules/@theholocron/eslint-config/package.json": JSON.stringify({
				exports: { ".": { import: "./dist/index.js" } },
			}),
		};
		expect(resolveToolConfig("eslint", CWD, makeFs(files))).toEqual([]);
	});

	it("returns [] when the resolved file doesn't exist on disk (stale install / unbuilt dist)", () => {
		const files = {
			"node_modules/@theholocron/eslint-config/package.json": JSON.stringify(
				exportsMap("./bundles/library", "./dist/bundles/library.js")
			),
			// dist/bundles/library.js deliberately absent
		};
		expect(resolveToolConfig("eslint", CWD, makeFs(files))).toEqual([]);
	});

	it("resolves eslint to --config <absolute path to bundles/library.js>", () => {
		const files = {
			"node_modules/@theholocron/eslint-config/package.json": JSON.stringify(
				exportsMap("./bundles/library", "./dist/bundles/library.js")
			),
			"node_modules/@theholocron/eslint-config/dist/bundles/library.js": "export default [];",
		};
		expect(resolveToolConfig("eslint", CWD, makeFs(files))).toEqual([
			"--config",
			"/repo/node_modules/@theholocron/eslint-config/dist/bundles/library.js",
		]);
	});

	it("resolves prettier to --config <absolute path to index.js>", () => {
		const files = {
			"node_modules/@theholocron/prettier-config/package.json": JSON.stringify(
				exportsMap(".", "./dist/index.js")
			),
			"node_modules/@theholocron/prettier-config/dist/index.js": "export default {};",
		};
		expect(resolveToolConfig("prettier", CWD, makeFs(files))).toEqual([
			"--config",
			"/repo/node_modules/@theholocron/prettier-config/dist/index.js",
		]);
	});

	it("resolves vitest to --config <absolute path to bundles/library.js>", () => {
		const files = {
			"node_modules/@theholocron/vitest-config/package.json": JSON.stringify(
				exportsMap("./bundles/library", "./dist/bundles/library.js")
			),
			"node_modules/@theholocron/vitest-config/dist/bundles/library.js": "export default {};",
		};
		expect(resolveToolConfig("vitest", CWD, makeFs(files))).toEqual([
			"--config",
			"/repo/node_modules/@theholocron/vitest-config/dist/bundles/library.js",
		]);
	});

	it("resolves tsdown to --config <absolute path to presets/library.js>", () => {
		const files = {
			"node_modules/@theholocron/tsdown-config/package.json": JSON.stringify(
				exportsMap("./presets/library", "./dist/presets/library.js")
			),
			"node_modules/@theholocron/tsdown-config/dist/presets/library.js": "export default {};",
		};
		expect(resolveToolConfig("tsdown", CWD, makeFs(files))).toEqual([
			"--config",
			"/repo/node_modules/@theholocron/tsdown-config/dist/presets/library.js",
		]);
	});

	it("resolves commitlint to --config <absolute path to index.js>", () => {
		const files = {
			"node_modules/@theholocron/commitlint-config/package.json": JSON.stringify(
				exportsMap(".", "./dist/index.js")
			),
			"node_modules/@theholocron/commitlint-config/dist/index.js": "export default {};",
		};
		expect(resolveToolConfig("commitlint", CWD, makeFs(files))).toEqual([
			"--config",
			"/repo/node_modules/@theholocron/commitlint-config/dist/index.js",
		]);
	});

	it("falls back to a bare string export entry (no condition object)", () => {
		const files = {
			"node_modules/@theholocron/prettier-config/package.json": JSON.stringify({
				exports: { ".": "./dist/index.js" },
			}),
			"node_modules/@theholocron/prettier-config/dist/index.js": "export default {};",
		};
		expect(resolveToolConfig("prettier", CWD, makeFs(files))).toEqual([
			"--config",
			"/repo/node_modules/@theholocron/prettier-config/dist/index.js",
		]);
	});

	it("falls back to require when import/default are both absent", () => {
		const files = {
			"node_modules/@theholocron/prettier-config/package.json": JSON.stringify({
				exports: { ".": { require: "./dist/index.cjs" } },
			}),
			"node_modules/@theholocron/prettier-config/dist/index.cjs": "module.exports = {};",
		};
		expect(resolveToolConfig("prettier", CWD, makeFs(files))).toEqual([
			"--config",
			"/repo/node_modules/@theholocron/prettier-config/dist/index.cjs",
		]);
	});

	it("returns [] when the export condition value isn't a string or object", () => {
		const files = {
			"node_modules/@theholocron/prettier-config/package.json": JSON.stringify({
				exports: { ".": { import: 42 } },
			}),
		};
		expect(resolveToolConfig("prettier", CWD, makeFs(files))).toEqual([]);
	});

	it("resolves a doubly-nested condition object (e.g. import: { types, default })", () => {
		const files = {
			"node_modules/@theholocron/prettier-config/package.json": JSON.stringify({
				exports: { ".": { import: { types: "./dist/index.d.ts", default: "./dist/index.js" } } },
			}),
			"node_modules/@theholocron/prettier-config/dist/index.js": "export default {};",
		};
		expect(resolveToolConfig("prettier", CWD, makeFs(files))).toEqual([
			"--config",
			"/repo/node_modules/@theholocron/prettier-config/dist/index.js",
		]);
	});
});

describe("resolveToolConfig — local config file wins (#749)", () => {
	const sharedInstalled = {
		"node_modules/@theholocron/eslint-config/package.json": JSON.stringify(
			exportsMap("./bundles/library", "./dist/bundles/library.js")
		),
		"node_modules/@theholocron/eslint-config/dist/bundles/library.js": "export default [];",
	};

	it("returns [] when a local eslint.config.ts exists, even though the shared package is installed", () => {
		const files = { ...sharedInstalled, "eslint.config.ts": "export default [];" };
		expect(resolveToolConfig("eslint", CWD, makeFs(files))).toEqual([]);
	});

	it("returns [] for a local config's .js/.mjs/.cjs variants too, not just .ts", () => {
		expect(resolveToolConfig("eslint", CWD, makeFs({ ...sharedInstalled, "eslint.config.js": "x" }))).toEqual([]);
		expect(resolveToolConfig("eslint", CWD, makeFs({ ...sharedInstalled, "eslint.config.mjs": "x" }))).toEqual([]);
		expect(resolveToolConfig("eslint", CWD, makeFs({ ...sharedInstalled, "eslint.config.cjs": "x" }))).toEqual([]);
	});

	it("still resolves the shared bundle when no local config file exists (unchanged behavior)", () => {
		expect(resolveToolConfig("eslint", CWD, makeFs(sharedInstalled))).toEqual([
			"--config",
			"/repo/node_modules/@theholocron/eslint-config/dist/bundles/library.js",
		]);
	});

	it("checks every resolvable tool's own local config filename, not just eslint's", () => {
		const vitestInstalled = {
			"node_modules/@theholocron/vitest-config/package.json": JSON.stringify(
				exportsMap("./bundles/library", "./dist/bundles/library.js")
			),
			"node_modules/@theholocron/vitest-config/dist/bundles/library.js": "export default {};",
			"vitest.config.ts": "export default mergeConfig(base, { test: { coverage: { exclude: [] } } });",
		};
		expect(resolveToolConfig("vitest", CWD, makeFs(vitestInstalled))).toEqual([]);
	});
});

describe("RESOLVABLE_TOOLS", () => {
	it("lists exactly the tools with a resolver mapping", () => {
		expect([...RESOLVABLE_TOOLS].sort()).toEqual(["commitlint", "eslint", "prettier", "tsdown", "vitest"]);
	});
});
