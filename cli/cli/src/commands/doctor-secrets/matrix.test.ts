import { describe, expect, it } from "vitest";

import type { Matrix, MatrixColumn, MatrixPlace } from "./doctor-secrets.type.js";
import { buildMatrix, cellFor } from "./matrix-build.js";
import { explainName } from "./matrix-explain.js";
import { MATRIX_LEGEND, renderMatrix } from "./matrix-render.js";
import { matrixRows } from "./matrix-rows.js";

const col = (id: string, group: string, label: string, extra: Partial<MatrixColumn> = {}): MatrixColumn => ({
	id,
	group,
	label,
	env: "ci",
	...extra,
});
const place = (column: MatrixColumn, p: Partial<MatrixPlace> = {}): MatrixPlace => ({
	column,
	kind: "secret",
	needed: [],
	...p,
});

describe("cellFor", () => {
	const none = new Set<string>();

	it("is ok where a name is needed and found, whatever the case", () => {
		expect(cellFor(place(col("a", "GitHub", "repo"), { needed: ["Key"], present: ["KEY"] }), "KEY", none)).toBe(
			"ok"
		);
	});

	it("is MISSING where a name is needed and not found", () => {
		expect(cellFor(place(col("a", "GitHub", "repo"), { needed: ["KEY"], present: [] }), "KEY", none)).toBe(
			"MISSING"
		);
		expect(cellFor(place(col("a", "GitHub", "repo"), { needed: ["KEY"] }), "KEY", none)).toBe("MISSING");
	});

	it("is extra where a name is found and nothing needs it, unless it is set by hand", () => {
		const p = place(col("a", "GitHub", "repo"), { present: ["KEY"] });
		expect(cellFor(p, "KEY", none)).toBe("extra");
		expect(cellFor(p, "KEY", new Set(["KEY"]))).toBe("n/a");
	});

	it("is n/a where a name is neither needed nor found", () => {
		expect(cellFor(place(col("a", "GitHub", "repo"), { needed: ["A"], present: ["A"] }), "B", none)).toBe("n/a");
	});

	it("is ? for a place that could not be read, whatever the name", () => {
		expect(cellFor(place(col("a", "GitHub", "repo"), { needed: ["KEY"], unread: "no token" }), "OTHER", none)).toBe(
			"?"
		);
	});
});

describe("buildMatrix", () => {
	const places = [
		place(col("deploy:prod", "Deploy", "prod"), { needed: ["B"], unread: "named at sync" }),
		place(col("github:repo", "GitHub", "repo"), { needed: ["A", "B"], present: ["a", "STRAY"] }),
		place(col("vault:ci", "1Password", "ci"), { needed: ["A"], present: ["A", "B"] }),
		place(col("github:repo-variables", "GitHub", "repo"), { kind: "variable", needed: ["V"], present: ["V"] }),
	];
	const matrix = buildMatrix(places);

	it("orders the columns vault, GitHub, deploy and keeps secrets and variables apart", () => {
		expect(matrix.columns.secret.map((c) => c.id)).toEqual(["vault:ci", "github:repo", "deploy:prod"]);
		expect(matrix.columns.variable.map((c) => c.id)).toEqual(["github:repo-variables"]);
		expect(matrix.secrets.map((r) => r.name)).toEqual(["A", "B", "STRAY"]);
		expect(matrix.variables.map((r) => r.name)).toEqual(["V"]);
	});

	it("gives each name a cell in each column", () => {
		expect(matrix.secrets.map((r) => r.cells)).toEqual([
			{ "vault:ci": "ok", "github:repo": "ok", "deploy:prod": "?" },
			{ "vault:ci": "extra", "github:repo": "MISSING", "deploy:prod": "?" },
			{ "vault:ci": "n/a", "github:repo": "extra", "deploy:prod": "?" },
		]);
	});

	it("leaves a name set by hand out of the extras", () => {
		expect(buildMatrix(places, ["stray"]).secrets[2]!.cells["github:repo"]).toBe("n/a");
	});

	it("keeps the order a group's columns were given in", () => {
		const two = buildMatrix([place(col("g:2", "GitHub", "org")), place(col("g:1", "GitHub", "repo"))]);
		expect(two.columns.secret.map((c) => c.id)).toEqual(["g:2", "g:1"]);
	});

	it("shows a column once when two places of one kind share it", () => {
		const shared = col("vault:ci", "1Password", "ci");
		const both = buildMatrix([
			place(shared, { needed: ["A"], present: ["A"] }),
			place(shared, { needed: ["B"], present: ["B"] }),
		]);
		expect(both.columns.secret.map((c) => c.id)).toEqual(["vault:ci"]);
	});
});

describe("renderMatrix", () => {
	const matrix = buildMatrix([
		place(col("vault:ci", "1Password", "ci"), { needed: ["A"], present: ["A"] }),
		place(col("github:repo", "GitHub", "repo"), { needed: ["A"], present: [] }),
		place(col("github:repo-variables", "GitHub", "repo"), { kind: "variable", needed: ["V"], present: ["V"] }),
	]);

	it("prints a heading and a table for each block, then the legend, one meaning per line", () => {
		const lines = renderMatrix(matrix, 100);
		expect(lines).toContain("Secrets");
		expect(lines).toContain("Variables");
		expect(lines).toContain("name  1Password ci  GitHub repo");
		expect(lines).toContain("A     ok            MISSING");
		expect(lines.slice(lines.indexOf("Legend") + 1)).toEqual(MATRIX_LEGEND.map((l) => `  ${l}`));
		expect(MATRIX_LEGEND).toHaveLength(5);
	});

	it("shows one block with --only-secrets or --only-variables", () => {
		expect(renderMatrix(matrix, 100, "secrets")).not.toContain("Variables");
		expect(renderMatrix(matrix, 100, "variables")).not.toContain("Secrets");
	});

	it("turns the block on its side when the table is wider than the terminal", () => {
		const lines = renderMatrix(matrix, 20, "secrets");
		expect(lines).toEqual(expect.arrayContaining(["A", "  1Password ci: ok", "  GitHub repo: MISSING"]));
		expect(lines.some((l) => l.startsWith("name"))).toBe(false);
	});

	it("says so when a block has nothing in it", () => {
		const empty: Matrix = buildMatrix([]);
		expect(renderMatrix(empty, 100)).toEqual(
			expect.arrayContaining(["  (no secrets declared or found)", "  (no variables declared or found)"])
		);
	});
});

describe("matrixRows", () => {
	const places = [
		place(col("vault:ci", "1Password", "ci", { unreadReported: true }), {
			needed: ["A", "GONE"],
			present: ["A", "STRAY"],
		}),
		place(col("github:repo", "GitHub", "repo", { reportedElsewhere: true }), {
			needed: ["A", "GONE"],
			present: ["A", "ONLY_HERE"],
		}),
		place(col("deploy:prod", "Deploy", "prod"), { needed: ["A"], unread: "named at sync" }),
		place(col("vault:prod", "1Password", "prod", { unreadReported: true }), { needed: ["A"], unread: "no token" }),
		place(col("github:org", "GitHub", "org", { reportedElsewhere: true }), { unread: "no token" }),
	];
	const matrix = buildMatrix(places);

	it("fails a MISSING name where no other check reports it, and skips the extras as info", () => {
		const rows = matrixRows(matrix, [], false);
		expect(rows.map((r) => [r.id, r.status])).toEqual([
			["missing:secret:vault:ci", "fail"],
			["extra:secret:vault:ci", "skip"],
			["extra:secret:github:repo", "skip"],
			["unread:secret:deploy:prod", "skip"],
		]);
		expect(rows[0]!.problems).toEqual(["missing secret GONE"]);
		expect(rows[1]!.detail).toBe("info: 1 extra in 1Password ci, nothing feeds it: STRAY");
		expect(rows[3]!.detail).toBe("could not read Deploy prod: named at sync");
	});

	it("makes an extra name a failure with strict, and never reports a name set by hand", () => {
		const strict = matrixRows(matrix, [], true).filter((r) => r.id.startsWith("extra"));
		expect(strict.map((r) => r.status)).toEqual(["fail", "fail"]);
		expect(strict[0]!.detail).toBe("1 extra in 1Password ci, nothing feeds it: STRAY");
		expect(
			matrixRows(buildMatrix(places, ["stray", "only_here"]), ["stray", "only_here"], true).map((r) => r.id)
		).toEqual(["missing:secret:vault:ci", "unread:secret:deploy:prod"]);
	});

	it("treats a place with no names read as holding none", () => {
		const bare = buildMatrix([place(col("v", "1Password", "ci"), { needed: ["A"] })]);
		expect(matrixRows(bare, [], false).map((r) => r.id)).toEqual(["missing:secret:v"]);
	});

	it("says them or it by how many are extra", () => {
		const two = buildMatrix([place(col("v", "1Password", "ci"), { present: ["X", "Y"] })]);
		expect(matrixRows(two, [], false)[0]!.detail).toBe("info: 2 extra in 1Password ci, nothing feeds them: X, Y");
	});
});

describe("explainName", () => {
	const places = [
		place(col("vault:ci", "1Password", "ci"), { needed: ["A"], present: ["A"], reasons: { A: "read by entry 1" } }),
		place(col("github:repo", "GitHub", "repo"), { needed: ["B"], present: ["A"] }),
		place(col("github:org", "GitHub", "org"), { needed: ["A"], present: [], reasons: {} }),
		place(col("deploy:prod", "Deploy", "prod"), { unread: "named at sync" }),
		place(col("github:env", "GitHub", "env x"), { present: ["A"] }),
	];
	const matrix = buildMatrix(places);

	it("says how each place stands for the name and why", () => {
		expect(explainName(matrix, "a", [])).toEqual([
			"1Password ci (secrets): ok, read by entry 1",
			"GitHub repo (secrets): extra, found here, but no entry feeds it",
			"GitHub org (secrets): MISSING, needed by the config",
			"Deploy prod (secrets): ?, could not read it: named at sync",
			"GitHub env x (secrets): extra, found here, but no entry feeds it",
		]);
	});

	it("notes a name set by hand, and a name nothing knows", () => {
		expect(explainName(matrix, "A", ["a"]).filter((l) => l.includes("by hand"))).toEqual([
			"GitHub repo (secrets): n/a, set by hand on purpose (doctor.manualSecrets)",
			"GitHub env x (secrets): n/a, set by hand on purpose (doctor.manualSecrets)",
		]);
		expect(explainName(matrix, "ZED", [])).toEqual(["Deploy prod (secrets): ?, could not read it: named at sync"]);
		expect(explainName(buildMatrix([]), "ZED", [])).toEqual([
			"ZED: no place the config declares or reads holds or needs this name",
		]);
	});
});
