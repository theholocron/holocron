import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	evaluate,
	hasDocsSignal,
	isAddedDocComment,
	isFeat,
	packageOf,
	pageNames,
	parseSkipDocs,
} from "./docs-presence.lib.mjs";

describe("parseSkipDocs", () => {
	it("finds the marker and the reason on its line", () => {
		assert.deepEqual(parseSkipDocs("Fixes a thing.\n[skip docs] internal option, no page\nMore."), {
			scope: null,
			reason: "internal option, no page",
		});
	});

	it("is case-insensitive and reads a scope of several packages", () => {
		assert.deepEqual(parseSkipDocs("[Skip Docs: array-utils, fs-utils] helpers only"), {
			scope: ["array-utils", "fs-utils"],
			reason: "helpers only",
		});
	});

	it("reports a marker without a reason, and none when there is no marker", () => {
		assert.deepEqual(parseSkipDocs("[skip docs]\nnext line"), { scope: null, reason: "" });
		assert.equal(parseSkipDocs("[skip ci] only"), null);
		assert.equal(parseSkipDocs(""), null);
	});
});

describe("isFeat", () => {
	it("matches feat with or without a scope, a bang or a gitmoji", () => {
		assert.equal(isFeat(["feat: add a thing"]), true);
		assert.equal(isFeat(["feat(cli): ✨ add a thing"]), true);
		assert.equal(isFeat(["fix: x", "feat!: break it"]), true);
	});

	it("ignores the other types", () => {
		assert.equal(isFeat(["fix: x", "docs(cli): y", "refactor: z", "feature: nope"]), false);
		assert.equal(isFeat([]), false);
	});
});

describe("packageOf", () => {
	const packages = {
		"utils/array-utils": {},
		"apps/sentinel": { private: true },
	};
	const read = (dir) => packages[dir];

	it("returns the package for its source and its root index", () => {
		assert.equal(packageOf("utils/array-utils/src/is-valid.ts", read), "utils/array-utils");
		assert.equal(packageOf("utils/array-utils/index.ts", read), "utils/array-utils");
	});

	it("ignores tests, other package files, private packages and files outside any package", () => {
		assert.equal(packageOf("utils/array-utils/src/is-valid.test.ts", read), undefined);
		assert.equal(packageOf("utils/array-utils/package.json", read), undefined);
		assert.equal(packageOf("utils/array-utils/README.md", read), undefined);
		assert.equal(packageOf("apps/sentinel/src/index.ts", read), undefined);
		assert.equal(packageOf("scripts/validate-adrs.mjs", read), undefined);
		assert.equal(packageOf("utils/array-utils/node_modules/x/src/a.ts", read), undefined);
	});
});

describe("pageNames", () => {
	it("adds the names without -client and holocron-plugin-", () => {
		assert.deepEqual(pageNames("clients/axiom-client"), ["axiom-client", "axiom"]);
		assert.deepEqual(pageNames("plugins/holocron-plugin-github"), ["holocron-plugin-github", "github"]);
		assert.deepEqual(pageNames("utils/array-utils"), ["array-utils"]);
	});
});

describe("isAddedDocComment", () => {
	it("matches added doc comment lines only", () => {
		assert.equal(isAddedDocComment("+/** One line. */"), true);
		assert.equal(isAddedDocComment("+\t * @remarks Long."), true);
		assert.equal(isAddedDocComment("+\t */"), true);
		assert.equal(isAddedDocComment("+const x = 1;"), false);
		assert.equal(isAddedDocComment("-/** removed */"), false);
		assert.equal(isAddedDocComment("+// a line comment"), false);
	});
});

describe("hasDocsSignal", () => {
	it("counts a changed README, a docs page named after the package, or a doc comment", () => {
		assert.equal(hasDocsSignal("utils/array-utils", ["utils/array-utils/README.md"], []), true);
		assert.equal(hasDocsSignal("utils/array-utils", ["docs/src/content/docs/utils/array-utils.mdx"], []), true);
		assert.equal(hasDocsSignal("clients/axiom-client", ["docs/src/content/docs/clients/axiom.mdx"], []), true);
		assert.equal(hasDocsSignal("utils/array-utils", [], ["+/** x */"]), true);
	});

	it("does not count an unrelated docs file or the generated reference folder name", () => {
		assert.equal(hasDocsSignal("utils/array-utils", ["docs/src/content/docs/utils/fs-utils.mdx"], []), false);
		assert.equal(hasDocsSignal("utils/array-utils", ["utils/other/README.md", "package.json"], []), false);
	});
});

describe("evaluate", () => {
	const base = {
		packages: ["utils/array-utils", "clients/axiom-client"],
		changedFiles: ["utils/array-utils/src/a.ts", "clients/axiom-client/src/b.ts"],
		addedCommentLines: () => [],
	};

	it("warns for each package without a docs signal", () => {
		assert.deepEqual(evaluate({ ...base, skip: null }), {
			warn: ["utils/array-utils", "clients/axiom-client"],
			skipped: [],
			missingReason: false,
		});
	});

	it("leaves out a package that has a docs signal", () => {
		const result = evaluate({
			...base,
			changedFiles: [...base.changedFiles, "docs/src/content/docs/clients/axiom.mdx"],
			skip: null,
		});
		assert.deepEqual(result.warn, ["utils/array-utils"]);
	});

	it("lets a marker with a reason silence every package when it has no scope", () => {
		const result = evaluate({ ...base, skip: { scope: null, reason: "internal only" } });
		assert.deepEqual(result.warn, []);
		assert.deepEqual(result.skipped, [
			{ dir: "utils/array-utils", reason: "internal only" },
			{ dir: "clients/axiom-client", reason: "internal only" },
		]);
	});

	it("limits a scoped marker to the packages it names, by folder name or page name", () => {
		const result = evaluate({ ...base, skip: { scope: ["axiom"], reason: "no page change needed" } });
		assert.deepEqual(result.warn, ["utils/array-utils"]);
		assert.deepEqual(result.skipped, [{ dir: "clients/axiom-client", reason: "no page change needed" }]);
	});

	it("keeps warning, and says so, when the marker has no reason", () => {
		const result = evaluate({ ...base, skip: { scope: null, reason: "" } });
		assert.equal(result.warn.length, 2);
		assert.equal(result.missingReason, true);
	});
});
