import { describe, expect, it } from "vitest";

import { stubSpawn } from "./__tests__/stub-spawn.js";
import { CodecovCli } from "./shell.js";

const make = (responses: Parameters<typeof stubSpawn>[0] = []) => {
	const stub = stubSpawn(responses);
	return {
		...stub,
		cli: new CodecovCli({ binary: "/b/codecov", spawn: stub.spawn, env: { PATH: "/bin", CI: "true" } }),
	};
};

describe("CodecovCli", () => {
	it("announces the commit and opens the report, with the token in the environment and never in argv", () => {
		const { cli, calls } = make();
		expect(cli.createCommit("sekret")).toEqual({ ok: true, stdout: "", stderr: "" });
		cli.createReport("sekret");
		expect(calls[0]).toMatchObject({
			binary: "/b/codecov",
			args: ["create-commit", "--fail-on-error", "--git-service", "github"],
			env: { PATH: "/bin", CI: "true", CODECOV_TOKEN: "sekret" },
		});
		expect(calls[1]?.args).toEqual(["create-report", "--fail-on-error", "--git-service", "github"]);
		expect(JSON.stringify(calls.map((c) => c.args))).not.toContain("sekret");
	});

	it("uploads each file under the flag, with searching off", () => {
		const { cli, calls } = make();
		cli.doUpload("sekret", "utils", ["/t/utils.1.info", "/t/utils.2.info"]);
		expect(calls[0]?.args).toEqual([
			"do-upload",
			"--flag",
			"utils",
			"--disable-search",
			"--fail-on-error",
			"--git-service",
			"github",
			"--file",
			"/t/utils.1.info",
			"--file",
			"/t/utils.2.info",
		]);
		expect(JSON.stringify(calls[0]?.args)).not.toContain("sekret");
	});

	it("reports a non-zero exit, and removes the token from what the CLI printed", () => {
		const { cli } = make([{ status: 1, stdout: " out sekret ", stderr: "bad token sekret\n" }]);
		expect(cli.createCommit("sekret")).toEqual({ ok: false, stdout: "out ***", stderr: "bad token ***" });
	});

	it("reports a spawn failure as a result, without the token", () => {
		const { cli } = make([{ error: new Error("spawn sekret ENOENT") }]);
		expect(cli.createReport("sekret")).toEqual({ ok: false, stdout: "", stderr: "spawn *** ENOENT" });
	});

	it("reads a process that left no output streams as printing nothing", () => {
		const spawn = (() => ({ status: 0, stdout: null, stderr: null })) as never;
		const cli = new CodecovCli({ binary: "/b/codecov", spawn, env: {} });
		expect(cli.createCommit("t")).toEqual({ ok: true, stdout: "", stderr: "" });
	});

	it("uses the real spawnSync when none is injected", () => {
		const cli = new CodecovCli({ binary: "/definitely/not/here/codecov", env: {} });
		const result = cli.createCommit("t");
		expect(result.ok).toBe(false);
		expect(result.stderr).not.toBe("");
	});
});
