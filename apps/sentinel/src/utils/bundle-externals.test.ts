import { describe, expect, it } from "vitest";

import { undeclaredExternals } from "../../scripts/bundle-externals.mjs";

/** Joins lines, so each fixture import sits on its own source line. */
const lines = (...l: string[]) => l.join("\n");

describe("undeclaredExternals (holocron#922)", () => {
	it("passes a bundle whose every bare import is a declared dependency", () => {
		const source = lines('import { lint } from "@commitlint/lint";', 'import YAML from "yaml";');
		expect(undeclaredExternals(source, { "@commitlint/lint": "21", yaml: "2" })).toEqual([]);
	});

	it("names each imported package missing from dependencies, sorted and de-duplicated", () => {
		const source = lines(
			'import { Entry } from "@napi-rs/keyring";',
			'import { a } from "zod";',
			'import { b } from "zod";'
		);
		expect(undeclaredExternals(source, {})).toEqual(["@napi-rs/keyring", "zod"]);
	});

	it("maps subpath imports to their package, scoped or not", () => {
		const source = lines(
			'import { logger } from "@theholocron/observability/logger";',
			'import { lint } from "markdownlint/promise";'
		);
		expect(undeclaredExternals(source, { "@theholocron/observability": "0", markdownlint: "0" })).toEqual([]);
	});

	it("covers side-effect imports, re-exports and dynamic import()s", () => {
		const source = lines(
			'import "side-effect";',
			'export { x } from "re-exported";',
			'const { register } = await import("tsx/esm/api");'
		);
		expect(undeclaredExternals(source, {})).toEqual(["re-exported", "side-effect", "tsx"]);
	});

	it("ignores node: builtins and relative imports", () => {
		const source = lines('import { join } from "node:path";', 'import { x } from "./chunk.mjs";');
		expect(undeclaredExternals(source, {})).toEqual([]);
	});
});
