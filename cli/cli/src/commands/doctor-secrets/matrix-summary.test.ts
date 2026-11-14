import { describe, expect, it } from "vitest";

import type { MatrixColumn, MatrixRow } from "./doctor-secrets.type.js";
import { buildMatrix } from "./matrix-build.js";
import { matrixSummary } from "./matrix-summary.js";

const column = (id: string): MatrixColumn => ({ id, group: "GitHub", label: id, env: "ci" });
const place = (id: string, needed: string[], present?: string[], unread?: string) => ({
	column: column(id),
	kind: "secret" as const,
	needed,
	...(present ? { present } : {}),
	...(unread ? { unread } : {}),
});

describe("matrixSummary", () => {
	it("counts the names and the ok, MISSING and extra cells, and leaves n/a out", () => {
		const matrix = buildMatrix([place("a", ["X", "GONE"], ["X", "STRAY"]), place("b", ["X"], ["X"])]);
		expect(matrixSummary(matrix, 0)).toBe("3 names: 2 ok, 1 MISSING, 1 extra");
	});

	it("counts a name once when it is in both blocks, and says name for one", () => {
		const matrix = buildMatrix([
			place("a", ["X"], ["X"]),
			{ ...place("v", ["X"], ["X"]), kind: "variable" as const },
		]);
		expect(matrixSummary(matrix, 0)).toBe("1 name: 2 ok, 0 MISSING, 0 extra");
	});

	it("shows `not read` only when a place could not be read, and the checks that failed", () => {
		const matrix = buildMatrix([place("a", ["X"], ["X"]), place("b", ["X"], undefined, "no token")]);
		expect(matrixSummary(matrix, 1)).toBe("1 name: 1 ok, 0 MISSING, 0 extra, 1 not read; 1 check failed");
		expect(matrixSummary(matrix, 2)).toContain("; 2 checks failed");
	});

	it("reads a matrix with no rows", () => {
		const empty = { columns: { secret: [], variable: [] }, secrets: [] as MatrixRow[], variables: [], places: [] };
		expect(matrixSummary(empty, 0)).toBe("0 names: 0 ok, 0 MISSING, 0 extra");
	});
});
