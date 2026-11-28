import { describe, expect, it } from "vitest";

import { scopeFix } from "./scope-fix.js";

const text = (...lines: string[]) => lines.map((l) => `${l}\n`).join("");

describe("scopeFix", () => {
	it("is null when the fix changes nothing", () => {
		expect(scopeFix("a\n", "a\n", new Set([1]))).toBeNull();
	});

	it("keeps the whole fix when the patch is not known", () => {
		expect(scopeFix(text("a ", "b "), text("a", "b"), undefined)).toBe(text("a", "b"));
	});

	it("applies a change to a line the pull request added", () => {
		expect(scopeFix(text("a ", "b"), text("a", "b"), new Set([1]))).toBe(text("a", "b"));
	});

	it("leaves a change to a line the pull request did not add, which is the point (holocron#1950)", () => {
		expect(scopeFix(text("a ", "b"), text("a", "b"), new Set([2]))).toBeNull();
	});

	it("applies the changes on added lines and leaves the others, in one file", () => {
		const original = text("one ", "two", "three ", "four");
		const fixed = text("one", "two", "three", "four");
		expect(scopeFix(original, fixed, new Set([3]))).toBe(text("one ", "two", "three", "four"));
		expect(scopeFix(original, fixed, new Set([1, 3]))).toBe(fixed);
	});

	it("keeps a whole run of changed lines together: a table re-padded for one changed row", () => {
		const original = text("| a | b |", "| - | - |", "| 1 | 22222 |", "| 3 | 4 |");
		const fixed = text("| a | b     |", "| - | ----- |", "| 1 | 22222 |", "| 3 | 4     |");
		// Only row 3 was added, and the rows around it are re-padded for it: each is a hunk of its own here.
		expect(scopeFix(original, fixed, new Set([3]))).toBeNull();
		expect(scopeFix(original, fixed, new Set([1, 2, 3, 4]))).toBe(fixed);
	});

	it("takes an insertion that sits next to an added line, and not one next to an untouched line", () => {
		const original = text("a", "b", "c");
		const fixed = text("a", "", "b", "c");
		expect(scopeFix(original, fixed, new Set([2]))).toBe(fixed);
		expect(scopeFix(original, fixed, new Set([1]))).toBe(fixed);
		expect(scopeFix(original, fixed, new Set([3]))).toBeNull();
	});

	it("treats a missing final newline as a change to the last line", () => {
		expect(scopeFix("a\nb", "a\nb\n", new Set([2]))).toBe("a\nb\n");
		expect(scopeFix("a\nb", "a\nb\n", new Set([1]))).toBeNull();
	});

	it("treats a new file, whose every line is added, as wholly in scope", () => {
		expect(scopeFix(text("a ", "b "), text("a", "b"), new Set([1, 2]))).toBe(text("a", "b"));
	});

	it("keeps CRLF line endings on the lines it leaves alone", () => {
		const original = "a \r\nb \r\nc\r\n";
		const fixed = "a\r\nb\r\nc\r\n";
		expect(scopeFix(original, fixed, new Set([2]), { perLine: true })).toBe("a \r\nb\r\nc\r\n");
	});

	it("handles an empty original", () => {
		expect(scopeFix("", "a\n", new Set())).toBeNull();
		expect(scopeFix("", "a\n", undefined)).toBe("a\n");
	});

	describe("per line (holocron#1950)", () => {
		const original = text("a ", "b ", "c ", "d");
		const fixed = text("a", "b", "c", "d");

		it("leaves an untouched line next to an added one alone, where a hunk would take both", () => {
			expect(scopeFix(original, fixed, new Set([2]))).toBe(fixed);
			expect(scopeFix(original, fixed, new Set([2]), { perLine: true })).toBe(text("a ", "b", "c ", "d"));
		});

		it("applies every added line of a run and none of the others", () => {
			expect(scopeFix(original, fixed, new Set([1, 3]), { perLine: true })).toBe(text("a", "b ", "c", "d"));
		});

		it("is null when no line of the run was added", () => {
			expect(scopeFix(original, fixed, new Set([4]), { perLine: true })).toBeNull();
		});

		it("still treats a run that changes the number of lines as one hunk", () => {
			const joined = scopeFix(text("a", "b", "c"), text("a", "bc"), new Set([3]), { perLine: true });
			expect(joined).toBe(text("a", "bc"));
		});

		it("takes the same result as a hunk when only one line differs", () => {
			expect(scopeFix(text("a ", "b"), text("a", "b"), new Set([1]), { perLine: true })).toBe(text("a", "b"));
		});
	});

	it("never writes a line that neither the original nor the fix has", () => {
		const original = text("a ", "b ", "c ", "d ");
		const fixed = text("a", "b", "c", "d");
		for (const added of [[1], [2], [3], [4], [1, 4], [2, 3]]) {
			const scoped = scopeFix(original, fixed, new Set(added))!;
			for (const line of scoped.split(/(?<=\n)/))
				expect([...original.split(/(?<=\n)/), ...fixed.split(/(?<=\n)/)]).toContain(line);
		}
	});
});
