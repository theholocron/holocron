import { describe, expect, it } from "vitest";

import { DEFAULT_LIMIT, parseArgs } from "./parse-args.js";

describe("parseArgs", () => {
	it("defaults to a first page of everything, with no fill", () => {
		expect(parseArgs([])).toEqual({ ok: true, options: { after: 0, limit: DEFAULT_LIMIT, pullRequests: false } });
	});

	it("reads every option", () => {
		const parsed = parseArgs([
			"--since",
			"2026-09-01",
			"--after",
			"40",
			"--limit",
			"5",
			"--milestone",
			"v5.0",
			"--project",
			"v5",
			"--pull-requests",
		]);
		expect(parsed).toEqual({
			ok: true,
			options: {
				since: "2026-09-01",
				after: 40,
				limit: 5,
				milestone: "v5.0",
				project: "v5",
				pullRequests: true,
			},
		});
	});

	it("expands numbers and ranges", () => {
		expect(parseArgs(["--issues", "12,15,20-22"])).toMatchObject({ options: { issues: [12, 15, 20, 21, 22] } });
	});

	const WINDOW = "--milestone and --project need a window to apply to: name it with --issues or --since";
	const LIST = "--issues takes numbers and ranges such as 12,15,20-25, not";
	it.each([
		[["--nope"], "unknown argument --nope"],
		[["--since"], "--since needs a value"],
		[["--since", "--limit"], "--since needs a value"],
		[["--since", "yesterday"], "--since takes a day as YYYY-MM-DD, not yesterday"],
		[["--after", "x"], "--after takes a whole number, not x"],
		[["--limit", "0"], "--limit takes a whole number of at least 1, not 0"],
		[["--limit", "x"], "--limit takes a whole number of at least 1, not x"],
		[["--issues", "a"], `${LIST} a`],
		[["--issues", "5-2"], `${LIST} 5-2`],
		[["--issues", "1-2-3"], `${LIST} 1-2-3`],
		[["--issues", "1-x"], `${LIST} 1-x`],
		[["--issues", "1-5000"], `${LIST} 1-5000`],
		[["--milestone", "v5.0"], WINDOW],
		[["--project", "v5"], WINDOW],
	])("refuses %j", (args, message) => {
		expect(parseArgs(args)).toEqual({ ok: false, message });
	});

	it("takes --milestone with --issues as its window", () => {
		expect(parseArgs(["--issues", "7", "--milestone", "v5.0"])).toMatchObject({ ok: true });
	});
});
