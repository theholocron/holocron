import { describe, expect, it } from "vitest";

import { evaluateDocsPresence } from "./evaluate-docs-presence.js";
import { hasDocsSignal } from "./has-docs-signal.js";
import { isAddedDocComment } from "./is-added-doc-comment.js";
import { isFeat } from "./is-feat.js";
import { packageOf } from "./package-of.js";
import { pageNames } from "./page-names.js";
import { parseSkipDocs } from "./parse-skip-docs.js";

describe("parseSkipDocs", () => {
	it("finds the marker and the reason on its line", () => {
		expect(parseSkipDocs("Fixes a thing.\n[skip docs] internal option, no page\nMore.")).toEqual({
			scope: null,
			reason: "internal option, no page",
		});
	});

	it("is case-insensitive and reads a scope of several packages", () => {
		expect(parseSkipDocs("[Skip Docs: array-utils, fs-utils] helpers only")).toEqual({
			scope: ["array-utils", "fs-utils"],
			reason: "helpers only",
		});
	});

	it("reports a marker without a reason, and none when there is no marker", () => {
		expect(parseSkipDocs("[skip docs]\nnext line")).toEqual({ scope: null, reason: "" });
		expect(parseSkipDocs("[skip ci] only")).toBeNull();
		expect(parseSkipDocs("")).toBeNull();
	});
});

describe("isFeat", () => {
	it("matches feat with or without a scope, a bang or a gitmoji", () => {
		expect(isFeat(["feat: add a thing"])).toBe(true);
		expect(isFeat(["feat(cli): ✨ add a thing"])).toBe(true);
		expect(isFeat(["fix: x", "feat!: break it"])).toBe(true);
	});

	it("ignores the other types", () => {
		expect(isFeat(["fix: x", "docs(cli): y", "refactor: z", "feature: nope"])).toBe(false);
		expect(isFeat([])).toBe(false);
	});
});

describe("packageOf", () => {
	const packages: Record<string, { private?: boolean }> = {
		"utils/array-utils": {},
		"apps/sentinel": { private: true },
	};
	const read = (dir: string): { private?: boolean } | undefined => packages[dir];

	it("returns the package for its source and its root index", () => {
		expect(packageOf("utils/array-utils/src/is-valid.ts", read)).toBe("utils/array-utils");
		expect(packageOf("utils/array-utils/index.ts", read)).toBe("utils/array-utils");
	});

	it("ignores tests, other package files, private packages and files outside any package", () => {
		expect(packageOf("utils/array-utils/src/is-valid.test.ts", read)).toBeUndefined();
		expect(packageOf("utils/array-utils/package.json", read)).toBeUndefined();
		expect(packageOf("utils/array-utils/README.md", read)).toBeUndefined();
		expect(packageOf("apps/sentinel/src/index.ts", read)).toBeUndefined();
		expect(packageOf("scripts/validate-adrs.mjs", read)).toBeUndefined();
		expect(packageOf("utils/array-utils/node_modules/x/src/a.ts", read)).toBeUndefined();
	});
});

describe("pageNames", () => {
	it("adds the names without -client and holocron-plugin-", () => {
		expect(pageNames("clients/axiom-client")).toEqual(["axiom-client", "axiom"]);
		expect(pageNames("plugins/holocron-plugin-github")).toEqual(["holocron-plugin-github", "github"]);
		expect(pageNames("utils/array-utils")).toEqual(["array-utils"]);
	});
});

describe("isAddedDocComment", () => {
	it("matches added doc comment lines only", () => {
		expect(isAddedDocComment("+/** One line. */")).toBe(true);
		expect(isAddedDocComment("+\t * @remarks Long.")).toBe(true);
		expect(isAddedDocComment("+\t */")).toBe(true);
		expect(isAddedDocComment("+const x = 1;")).toBe(false);
		expect(isAddedDocComment("-/** removed */")).toBe(false);
		expect(isAddedDocComment("+// a line comment")).toBe(false);
	});
});

describe("hasDocsSignal", () => {
	it("counts a changed README, a docs page named after the package, or a doc comment", () => {
		expect(hasDocsSignal("utils/array-utils", ["utils/array-utils/README.md"], [])).toBe(true);
		expect(hasDocsSignal("utils/array-utils", ["docs/src/content/docs/utils/array-utils.mdx"], [])).toBe(true);
		expect(hasDocsSignal("clients/axiom-client", ["docs/src/content/docs/clients/axiom.mdx"], [])).toBe(true);
		expect(hasDocsSignal("utils/array-utils", [], ["+/** x */"])).toBe(true);
	});

	it("does not count an unrelated docs file or README, or a docs file that is not markdown", () => {
		expect(hasDocsSignal("utils/array-utils", ["docs/src/content/docs/utils/fs-utils.mdx"], [])).toBe(false);
		expect(hasDocsSignal("utils/array-utils", ["utils/other/README.md", "package.json"], [])).toBe(false);
		expect(hasDocsSignal("utils/array-utils", ["docs/array-utils.png"], [])).toBe(false);
	});
});

describe("evaluateDocsPresence", () => {
	const base = {
		packages: ["utils/array-utils", "clients/axiom-client"],
		changedFiles: ["utils/array-utils/src/a.ts", "clients/axiom-client/src/b.ts"],
		addedCommentLines: () => [] as string[],
	};

	it("warns for each package without a docs signal", () => {
		expect(evaluateDocsPresence({ ...base, skip: null })).toEqual({
			warn: ["utils/array-utils", "clients/axiom-client"],
			skipped: [],
			missingReason: false,
		});
	});

	it("leaves out a package that has a docs signal", () => {
		const result = evaluateDocsPresence({
			...base,
			changedFiles: [...base.changedFiles, "docs/src/content/docs/clients/axiom.mdx"],
			skip: null,
		});
		expect(result.warn).toEqual(["utils/array-utils"]);
	});

	it("lets a marker with a reason silence every package when it has no scope", () => {
		const result = evaluateDocsPresence({ ...base, skip: { scope: null, reason: "internal only" } });
		expect(result.warn).toEqual([]);
		expect(result.skipped).toEqual([
			{ dir: "utils/array-utils", reason: "internal only" },
			{ dir: "clients/axiom-client", reason: "internal only" },
		]);
	});

	it("limits a scoped marker to the packages it names, by folder, page name or path", () => {
		const byPage = evaluateDocsPresence({ ...base, skip: { scope: ["axiom"], reason: "no page change needed" } });
		expect(byPage.warn).toEqual(["utils/array-utils"]);
		expect(byPage.skipped).toEqual([{ dir: "clients/axiom-client", reason: "no page change needed" }]);
		const byPath = evaluateDocsPresence({ ...base, skip: { scope: ["utils/array-utils"], reason: "r" } });
		expect(byPath.warn).toEqual(["clients/axiom-client"]);
	});

	it("keeps warning, and says so, when the marker has no reason", () => {
		const result = evaluateDocsPresence({ ...base, skip: { scope: null, reason: "" } });
		expect(result.warn).toHaveLength(2);
		expect(result.missingReason).toBe(true);
	});
});
