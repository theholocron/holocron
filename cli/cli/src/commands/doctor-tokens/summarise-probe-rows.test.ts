import { describe, expect, it } from "vitest";

import { summariseProbeRows } from "./summarise-probe-rows.js";

const sum = (rows: Parameters<typeof summariseProbeRows>[2]) => summariseProbeRows("id", "title", rows);

describe("summariseProbeRows", () => {
	it("fails and lists each failing check, with its detail when it has one", () => {
		expect(
			sum([
				{ status: "heading", label: "HOLOCRON_X_TOKEN" },
				{ status: "ok", label: "Pages" },
				{ status: "fail", label: "Zone: DNS", detail: "must not have it" },
				{ status: "fail", label: "age" },
			])
		).toEqual({
			id: "id",
			title: "title",
			status: "fail",
			detail: "2 of 3 checks failed",
			problems: ["Zone: DNS: must not have it", "age"],
		});
	});

	it("passes with the count of checks and of noted rows", () => {
		expect(sum([{ status: "ok", label: "a" }])).toMatchObject({ status: "ok", detail: "1 check passed" });
		expect(
			sum([
				{ status: "ok", label: "a" },
				{ status: "ok", label: "b" },
			])
		).toMatchObject({ detail: "2 checks passed" });
		expect(
			sum([
				{ status: "ok", label: "a" },
				{ status: "info", label: "rotation", detail: "not exposed" },
			])
		).toMatchObject({ status: "ok", detail: "1 check passed, 1 noted" });
	});

	it("skips when the probe checked nothing", () => {
		expect(sum([{ status: "heading", label: "h" }])).toMatchObject({ status: "skip" });
		expect(sum([{ status: "info", label: "n" }])).toMatchObject({ status: "skip" });
	});
});
