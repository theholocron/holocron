import { describe, expect, it } from "vitest";

import { ciMessageMarker } from "../ci-message-marker/index.js";
import type { CiVerdict } from "../pr-feed.type.js";
import { renderCiMessage } from "./render-ci-message.js";

const SHA = "abc1234def5678";

function verdict(over: Partial<CiVerdict> = {}): CiVerdict {
	return {
		repo: "theholocron/holocron",
		sha: SHA,
		conclusion: "failure",
		runUrl: "https://github.com/run/1",
		failed: [],
		...over,
	};
}

function failed(count: number): CiVerdict["failed"] {
	return Array.from({ length: count }, (_, i) => ({
		name: `check-${i + 1}`,
		url: `https://github.com/check/${i + 1}`,
	}));
}

describe("renderCiMessage", () => {
	it("says CI passed with a short sha and a link, ending with the marker", () => {
		const text = renderCiMessage(verdict({ conclusion: "success" }));
		expect(text).toBe(
			`✅ CI passed on abc1234 ([run](https://github.com/run/1))\n${ciMessageMarker(SHA, "success")}`
		);
	});

	it("says CI failed with no list when no check is named", () => {
		const text = renderCiMessage(verdict());
		expect(text).toContain("❌ CI failed on abc1234 (failure)");
		expect(text).not.toContain("- [");
		expect(text).not.toContain("and ");
		expect(text.endsWith("-# ci: abc1234def5678 failure")).toBe(true);
	});

	it("lists one failed check", () => {
		expect(renderCiMessage(verdict({ failed: failed(1) }))).toContain("- [check-1](https://github.com/check/1)");
	});

	it("lists five failed checks without a rest line", () => {
		const text = renderCiMessage(verdict({ failed: failed(5) }));
		expect(text.match(/^- \[/gm)).toHaveLength(5);
		expect(text).not.toContain("more");
	});

	it("cuts eight at five and counts the rest", () => {
		const text = renderCiMessage(verdict({ failed: failed(8) }));
		expect(text.match(/^- \[/gm)).toHaveLength(5);
		expect(text).not.toContain("check-6");
		expect(text).toContain("and 3 more");
	});

	it("says and 1 more for six", () => {
		expect(renderCiMessage(verdict({ failed: failed(6) }))).toContain("and 1 more");
	});

	it("links the aggregate's summary when there is one", () => {
		expect(renderCiMessage(verdict({ summaryUrl: "https://github.com/summary" }))).toContain(
			"[Every expected check](https://github.com/summary)"
		);
		expect(renderCiMessage(verdict())).not.toContain("Every expected check");
	});

	it("names timed_out and cancelled", () => {
		expect(renderCiMessage(verdict({ conclusion: "timed_out" }))).toContain("(timed_out)");
		expect(renderCiMessage(verdict({ conclusion: "cancelled" }))).toContain("(cancelled)");
	});

	it("round trips the marker: the last line is exactly ciMessageMarker", () => {
		for (const conclusion of ["success", "failure", "timed_out", "cancelled"] as const) {
			const lines = renderCiMessage(verdict({ conclusion, failed: failed(2) })).split("\n");
			expect(lines.at(-1)).toBe(ciMessageMarker(SHA, conclusion));
		}
	});
});
