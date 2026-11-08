import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createCliRunner } from "./cli-runner.js";

// A stand-in for a built CLI: it says where and how it was run, and can fail, hang or read its config. Written as lines
// without indentation, because an indented template literal trips the editorconfig check.
const script = [
	'const fs = require("node:fs");',
	"const args = process.argv.slice(2);",
	'if (args.includes("--self-kill")) process.kill(process.pid, "SIGTERM");',
	'else if (args.includes("--hang")) setInterval(() => {}, 1000);',
	"else {",
	'const config = fs.existsSync("tool.config.json") ? fs.readFileSync("tool.config.json", "utf8") : null;',
	"console.log(JSON.stringify({ args, cwd: process.cwd(), config, env: process.env }));",
	'if (args.includes("--fail")) { console.error("boom"); process.exit(3); }',
	"}",
].join("\n");

describe("createCliRunner", () => {
	let dir: string;
	let bin: string;
	const parse = (stdout: string) =>
		JSON.parse(stdout) as { args: string[]; cwd: string; config: string | null; env: Record<string, string> };

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), "runner-fixture-"));
		bin = join(dir, "cli.cjs");
		writeFileSync(bin, script);
	});
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	it("runs the binary with the arguments in a fresh directory, and removes the directory afterwards", async () => {
		const run = createCliRunner({ bin, prefix: "tool-" });
		const result = await run(["a", "b"]);
		const out = parse(result.stdout);
		expect(result.code).toBe(0);
		expect(out.args).toEqual(["a", "b"]);
		expect(out.cwd).toContain("tool-");
		expect(existsSync(out.cwd)).toBe(false);
	});

	it("names the directory cli- unless told otherwise", async () => {
		expect(parse((await createCliRunner({ bin })([])).stdout).cwd).toContain("cli-");
	});

	it("reports stderr and a non-zero exit code", async () => {
		const result = await createCliRunner({ bin })(["--fail"]);
		expect(result.code).toBe(3);
		expect(result.stderr).toContain("boom");
	});

	it("builds the environment from nothing, so what the test run has does not leak in", async () => {
		process.env["KYBER_TEST_SECRET"] = "leaked";
		try {
			const { env } = parse((await createCliRunner({ bin })([])).stdout);
			expect(env["KYBER_TEST_SECRET"]).toBeUndefined();
			expect(env).toMatchObject({ NO_COLOR: "1", FORCE_COLOR: "0", NO_UPDATE_NOTIFIER: "1" });
			expect(env["HOME"]).toBe(env["TMPDIR"]);
		} finally {
			delete process.env["KYBER_TEST_SECRET"];
		}
	});

	it("passes an empty PATH when the test run has none", async () => {
		const path = process.env["PATH"];
		delete process.env["PATH"];
		try {
			expect(parse((await createCliRunner({ bin })([])).stdout).env["PATH"]).toBe("");
		} finally {
			if (path !== undefined) process.env["PATH"] = path;
		}
	});

	it("adds the runner's environment, then the run's, which wins", async () => {
		const run = createCliRunner({ bin, env: { TOOL_TELEMETRY: "false", TOOL_LEVEL: "runner" } });
		const { env } = parse((await run([], { env: { TOOL_LEVEL: "run" } })).stdout);
		expect(env["TOOL_TELEMETRY"]).toBe("false");
		expect(env["TOOL_LEVEL"]).toBe("run");
	});

	it("writes an object config as JSON, and a string config as it is", async () => {
		const run = createCliRunner({ bin, configFile: "tool.config.json" });
		expect(parse((await run([], { config: { a: 1 } })).stdout).config).toBe('{"a":1}');
		expect(parse((await run([], { config: "{ not json" })).stdout).config).toBe("{ not json");
		expect(parse((await run([])).stdout).config).toBeNull();
	});

	it("refuses a config when the runner was made without a configFile", async () => {
		await expect(createCliRunner({ bin })([], { config: {} })).rejects.toThrow(/no configFile/);
	});

	it("kills a run that outlasts its timeout and says so with -1", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const result = await createCliRunner({ bin })(["--hang"], { timeoutMs: 300 });
		log.mockRestore();
		expect(result.code).toBe(-1);
		expect(result.timedOut).toBe(true);
	});

	it("says in stderr how long a killed run lasted and what it had printed", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const result = await createCliRunner({ bin })(["--hang"], { timeoutMs: 300 });
		expect(log).toHaveBeenCalledWith(expect.stringContaining("[cli-runner] killed"));
		log.mockRestore();
		expect(result.stderr).toMatch(
			/\[cli-runner\] killed after \d+ ms \(timeout 300 ms, SIGKILL\), pid \d+; stdout 0 chars/
		);
		expect(result.elapsedMs).toBeGreaterThanOrEqual(250);
	});

	it("says so when something other than its timeout ended a run with a signal", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const result = await createCliRunner({ bin })(["--self-kill"]);
		log.mockRestore();
		expect(result.code).toBe(-1);
		expect(result.timedOut).toBe(false);
		expect(result.stderr).toMatch(/\[cli-runner\] ended by SIGTERM after \d+ ms, not by its timeout \(60000 ms\)/);
	});

	it("leaves stderr alone and timedOut false for a run that finishes", async () => {
		const result = await createCliRunner({ bin })(["--fail"]);
		expect(result.timedOut).toBe(false);
		expect(result.stderr).not.toContain("[cli-runner]");
		expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
	});

	it("reports a failing exit code for a binary that does not exist", async () => {
		const result = await createCliRunner({ bin: join(dir, "missing.cjs") })([]);
		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("missing.cjs");
	});
});
