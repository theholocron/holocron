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
	const TOKEN = "s3cret-token";
	const HEADER = `basic ${Buffer.from(`x-access-token:${TOKEN}`).toString("base64")}`;

	it("tags the release commit and pushes the tag, handing the token to the push in its environment only", () => {
		const run = vi.fn<Run>(() => result(0));
		expect(writeMarker(run, "/repo", "deployed/x", "new", TOKEN)).toBeUndefined();
		expect(run).toHaveBeenNthCalledWith(1, "git", ["tag", "--force", "deployed/x", "new"], { cwd: "/repo" });
		const [, args, options] = run.mock.calls[1]!;
		expect(args).toEqual(["push", "--force", "origin", "refs/tags/deployed/x"]);
		expect(options).toMatchObject({
			cwd: "/repo",
			env: {
				GIT_CONFIG_COUNT: "1",
				GIT_CONFIG_KEY_0: "http.extraheader",
				GIT_CONFIG_VALUE_0: `AUTHORIZATION: ${HEADER}`,
			},
		});
		// Never in argv.
		expect(JSON.stringify(run.mock.calls.map(([, a]) => a))).not.toContain(TOKEN);
	});

	it("reports a tag that cannot be made, without pushing", () => {
		const run = vi.fn<Run>(() => result(128, "", "bad object"));
		expect(writeMarker(run, "/repo", "deployed/x", "new", TOKEN)).toBe("couldn't tag deployed/x: bad object");
		expect(run).toHaveBeenCalledOnce();
	});

	it("falls back to the exit status when a failed tag or push printed nothing", () => {
		const tagFails = vi.fn<Run>(() => result(128));
		expect(writeMarker(tagFails, "/repo", "deployed/x", "new", TOKEN)).toBe("couldn't tag deployed/x: 128");
		const pushFails = vi.fn<Run>((_c, args) => (args[0] === "tag" ? result(0) : result(2)));
		expect(writeMarker(pushFails, "/repo", "deployed/x", "new", TOKEN)).toBe("couldn't push deployed/x: 2");
	});

	it("scrubs the token and its header from git's message when the push fails", () => {
		const run = vi.fn<Run>((_c, args) =>
			args[0] === "tag" ? result(0) : result(1, "", `denied ${TOKEN} ${HEADER}`)
		);
		expect(writeMarker(run, "/repo", "deployed/x", "new", TOKEN)).toBe("couldn't push deployed/x: denied *** ***");
	});

	it("scrubs the token from a failed tag's message too", () => {
		const run = vi.fn<Run>(() => result(1, "", `oops ${TOKEN}`));
		expect(writeMarker(run, "/repo", "deployed/x", "new", TOKEN)).toBe("couldn't tag deployed/x: oops ***");
	});
});
