import { describe, expect, it, vi } from "vitest";

import type { Run } from "../../../utils/index.js";
import { markerTag, readMarker, writeMarker } from "./index.js";

const result = (status: number, stdout = "", stderr = "") => ({ status, stdout, stderr });

describe("markerTag", () => {
	it("drops the scope's @ and turns / into -", () => {
		expect(markerTag("@theholocron/sentinel")).toBe("deployed/theholocron-sentinel");
		expect(markerTag("plain")).toBe("deployed/plain");
	});
});

describe("readMarker", () => {
	it("returns the recorded commit when it is an ancestor of the release", () => {
		const run = vi.fn<Run>((_c, args) => (args[0] === "rev-parse" ? result(0, "abc1234567\n") : result(0)));
		expect(readMarker(run, "/repo", "deployed/x", "new")).toEqual({ sha: "abc1234567" });
		expect(run).toHaveBeenCalledWith("git", ["merge-base", "--is-ancestor", "abc1234567", "new"], { cwd: "/repo" });
	});

	it("returns nothing for a package with no recorded deploy", () => {
		const run = vi.fn<Run>(() => result(1));
		expect(readMarker(run, "/repo", "deployed/x", "new")).toEqual({});
		expect(run).toHaveBeenCalledOnce();
	});

	it("ignores, saying so, a marker that is not an ancestor of the release", () => {
		const run = vi.fn<Run>((_c, args) => (args[0] === "rev-parse" ? result(0, "abc1234567\n") : result(1)));
		const read = readMarker(run, "/repo", "deployed/x", "new");
		expect(read.sha).toBeUndefined();
		expect(read.note).toContain("not an ancestor");
	});
});

describe("writeMarker", () => {
	it("tags the release commit and pushes the tag", () => {
		const run = vi.fn<Run>(() => result(0));
		expect(writeMarker(run, "/repo", "deployed/x", "new")).toBeUndefined();
		expect(run).toHaveBeenNthCalledWith(1, "git", ["tag", "--force", "deployed/x", "new"], { cwd: "/repo" });
		expect(run).toHaveBeenNthCalledWith(2, "git", ["push", "--force", "origin", "refs/tags/deployed/x"], {
			cwd: "/repo",
		});
	});

	it("reports a tag that cannot be made, without pushing", () => {
		const run = vi.fn<Run>(() => result(128, "", "bad object"));
		expect(writeMarker(run, "/repo", "deployed/x", "new")).toBe("couldn't tag deployed/x: bad object");
		expect(run).toHaveBeenCalledOnce();
	});

	it("reports a push that fails", () => {
		const run = vi.fn<Run>((_c, args) => (args[0] === "tag" ? result(0) : result(1, "", "denied")));
		expect(writeMarker(run, "/repo", "deployed/x", "new")).toBe("couldn't push deployed/x: denied");
	});
});
