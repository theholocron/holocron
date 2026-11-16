import { describe, expect, it, vi } from "vitest";

import { stubSpawn } from "./__tests__/stub-spawn.js";
import { CodecovCli } from "./shell.js";
import type { UploadDeps } from "./upload.type.js";
import { uploadCoverage } from "./upload-coverage.js";

const REPORT = "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record\n";

interface Setup {
	files: Record<string, string>;
	globs?: Record<string, string[]>;
	env?: Record<string, string | undefined>;
	cli?: Array<{ status?: number; stderr?: string }>;
	tokens?: string[];
	tokenFailsOn?: number[];
}

function setup(over: Setup) {
	const spawn = stubSpawn(over.cli ?? []);
	const cli = new CodecovCli({ binary: "/cli/codecov", spawn: spawn.spawn, env: {} });
	const written: Record<string, string> = {};
	const logs: string[] = [];
	const masked: string[] = [];
	let tokenCalls = 0;
	const fetchStub = vi.fn(async () => {
		const n = tokenCalls++;
		if (over.tokenFailsOn?.includes(n + 1)) return { ok: false, status: 500, json: async () => ({}) };
		return { ok: true, status: 200, json: async () => ({ value: over.tokens?.[n] ?? `oidc-${n + 1}` }) };
	}) as unknown as typeof fetch;
	const sleep = vi.fn(async () => {});
	const env = over.env ?? {
		ACTIONS_ID_TOKEN_REQUEST_URL: "https://run.test/t?a=1",
		ACTIONS_ID_TOKEN_REQUEST_TOKEN: "b",
	};
	const deps: UploadDeps = {
		env: (name) => env[name],
		fetch: fetchStub,
		prepareCli: vi.fn(async () => cli),
		expandGlob: (pattern) => over.globs?.[pattern] ?? [],
		readFile: (path) => {
			const key = path.replace(/^\/repo\//, "");
			if (!(key in over.files)) throw new Error(`unexpected read ${path}`);
			return over.files[key] as string;
		},
		writeFile: (path, data) => void (written[path] = data),
		makeTempDir: () => "/scratch",
		sleep,
		log: (line) => void logs.push(line),
		mask: (value) => void masked.push(value),
	};
	return { deps, spawn, written, logs, masked, sleep, fetchStub };
}

const input = (uploads: Array<{ flag: string; files: string[] }>, allowEmpty?: boolean) => ({
	uploads,
	repoRoot: "/repo",
	...(allowEmpty === undefined ? {} : { allowEmpty }),
});

describe("uploadCoverage", () => {
	it("announces the commit, opens the report, then uploads each flag with rooted copies", async () => {
		const t = setup({
			files: {
				"utils/a-utils/coverage/lcov.info": REPORT,
				"utils/b-utils/coverage/lcov.info": REPORT,
				"lcov.info": REPORT,
			},
			globs: {
				"utils/*/coverage/lcov.info": ["utils/a-utils/coverage/lcov.info", "utils/b-utils/coverage/lcov.info"],
				"lcov.info": ["lcov.info"],
			},
		});
		const result = await uploadCoverage(
			input([
				{ flag: "utils", files: ["utils/*/coverage/lcov.info"] },
				{ flag: "root", files: ["lcov.info"] },
			]),
			t.deps
		);
		expect(result).toEqual({
			flags: [
				{ flag: "utils", outcome: "uploaded", files: 2, notes: [] },
				{ flag: "root", outcome: "uploaded", files: 1, notes: [] },
			],
			uploaded: 2,
		});
		expect(t.spawn.calls.map((c) => c.args[0])).toEqual([
			"create-commit",
			"create-report",
			"do-upload",
			"do-upload",
		]);
		expect(t.spawn.calls[2]?.args).toContain("/scratch/utils.2.info");
		expect(t.written["/scratch/utils.1.info"]).toContain("SF:utils/a-utils/src/index.ts");
		expect(t.written["/scratch/utils.2.info"]).toContain("SF:utils/b-utils/src/index.ts");
		expect(t.written["/scratch/root.1.info"]).toBe(REPORT);
		expect(t.logs).toEqual(["→ utils: 2 file(s)", "→ root: 1 file(s)"]);
	});

	it("fetches a fresh token before the commit and before every upload, masks each, and never prints one", async () => {
		const t = setup({
			files: { "a/coverage/lcov.info": REPORT, "b/coverage/lcov.info": REPORT },
			globs: { a: ["a/coverage/lcov.info"], b: ["b/coverage/lcov.info"] },
		});
		const result = await uploadCoverage(
			input([
				{ flag: "a", files: ["a"] },
				{ flag: "b", files: ["b"] },
			]),
			t.deps
		);
		expect(t.masked).toEqual(["oidc-1", "oidc-2", "oidc-3"]);
		expect(t.spawn.calls.map((c) => c.env?.CODECOV_TOKEN)).toEqual(["oidc-1", "oidc-1", "oidc-2", "oidc-3"]);
		expect(JSON.stringify([result, t.logs, t.spawn.calls.map((c) => c.args)])).not.toContain("oidc-");
	});

	it("skips a group whose glob matches nothing, with a note", async () => {
		const t = setup({ files: {} });
		const result = await uploadCoverage(input([{ flag: "x", files: ["nope"] }], true), t.deps);
		expect(result).toEqual({
			flags: [{ flag: "x", outcome: "skipped", files: 0, notes: ["no coverage files"] }],
			uploaded: 0,
		});
		expect(t.logs).toEqual(["· x: no coverage files"]);
		expect(t.spawn.calls.map((c) => c.args[0])).toEqual(["create-commit", "create-report"]);
	});

	it("leaves out a report that names no source file, and skips the group when none is left", async () => {
		const t = setup({
			files: { "a/lcov.info": "TN:\nend_of_record\n", "b/lcov.info": REPORT },
			globs: { a: ["a/lcov.info"], mixed: ["a/lcov.info", "b/lcov.info"] },
		});
		const result = await uploadCoverage(
			input([
				{ flag: "a", files: ["a"] },
				{ flag: "m", files: ["mixed"] },
			]),
			t.deps
		);
		expect(result.flags).toEqual([
			{
				flag: "a",
				outcome: "skipped",
				files: 0,
				notes: ["a/lcov.info names no source file, left out", "no coverage files"],
			},
			{ flag: "m", outcome: "uploaded", files: 1, notes: ["a/lcov.info names no source file, left out"] },
		]);
		expect(result.problem).toBeUndefined();
	});

	it("counts a file two patterns match once, and makes the copy's name safe", async () => {
		const t = setup({ files: { "a/lcov.info": REPORT }, globs: { p1: ["a/lcov.info"], p2: ["a/lcov.info"] } });
		const result = await uploadCoverage(input([{ flag: "web/ui", files: ["p1", "p2"] }]), t.deps);
		expect(result.flags[0]?.files).toBe(1);
		expect(Object.keys(t.written)).toEqual(["/scratch/web_ui.1.info"]);
	});

	it("is a problem when nothing was uploaded and empty was not allowed", async () => {
		const t = setup({ files: {} });
		const result = await uploadCoverage(input([{ flag: "x", files: ["nope"] }]), t.deps);
		expect(result.problem).toBe("No group has a coverage file, so nothing was uploaded.");
		expect(result.uploaded).toBe(0);
	});

	it("tries a failed upload again with a fresh token and a growing wait, then succeeds", async () => {
		const t = setup({
			files: { "a/lcov.info": REPORT },
			globs: { a: ["a/lcov.info"] },
			cli: [{}, {}, { status: 1, stderr: "5xx" }, { status: 1, stderr: "5xx" }, {}],
		});
		const result = await uploadCoverage(input([{ flag: "a", files: ["a"] }]), t.deps);
		expect(result.uploaded).toBe(1);
		expect(t.sleep.mock.calls).toEqual([[15_000], [30_000]]);
		expect(t.logs).toContain("a upload failed (attempt 1 of 4); trying again in 15s.");
		expect(t.logs).toContain("a upload failed (attempt 2 of 4); trying again in 30s.");
		expect(t.masked).toHaveLength(4);
	});

	it("fails the group after four tries (waiting 15, 30 and 45 s) and stops the run there", async () => {
		const t = setup({
			files: { "a/lcov.info": REPORT, "b/lcov.info": REPORT },
			globs: { a: ["a/lcov.info"], b: ["b/lcov.info"] },
			cli: [{}, {}, ...Array.from({ length: 4 }, () => ({ status: 1, stderr: "Repository not found" }))],
		});
		const result = await uploadCoverage(
			input([
				{ flag: "a", files: ["a"] },
				{ flag: "b", files: ["b"] },
			]),
			t.deps
		);
		expect(t.sleep.mock.calls).toEqual([[15_000], [30_000], [45_000]]);
		expect(result.flags).toHaveLength(1);
		expect(result.flags[0]).toMatchObject({ flag: "a", outcome: "failed", files: 0 });
		expect(result.problem).toBe("Codecov rejected the a upload 4 times: Repository not found");
		expect(result.uploaded).toBe(0);
	});

	it("counts a try that cannot get a token as a failed try", async () => {
		const t = setup({
			files: { "a/lcov.info": REPORT },
			globs: { a: ["a/lcov.info"] },
			tokenFailsOn: [2, 3, 4],
			cli: [{}, {}],
		});
		const result = await uploadCoverage(input([{ flag: "a", files: ["a"] }]), t.deps);
		expect(result.flags[0]?.outcome).toBe("uploaded");
		expect(t.sleep).toHaveBeenCalledTimes(3);
	});

	it("says so when the CLI fails an upload without a word", async () => {
		const t = setup({
			files: { "a/lcov.info": REPORT },
			globs: { a: ["a/lcov.info"] },
			cli: [{}, {}, ...Array.from({ length: 4 }, () => ({ status: 1 }))],
		});
		const result = await uploadCoverage(input([{ flag: "a", files: ["a"] }]), t.deps);
		expect(result.problem).toBe("Codecov rejected the a upload 4 times: the Codecov CLI exited non-zero");
	});

	it("reports an error that is not an Error by its text", async () => {
		const t = setup({ files: { "a/lcov.info": REPORT }, globs: { a: ["a/lcov.info"] } });
		t.deps.sleep = async () => {};
		const cli = {
			createCommit: () => ({ ok: true }),
			createReport: () => ({ ok: true }),
			doUpload: () => {
				throw "plain";
			},
		};
		t.deps.prepareCli = async () => cli as never;
		const result = await uploadCoverage(input([{ flag: "a", files: ["a"] }]), t.deps);
		expect(result.problem).toBe("Codecov rejected the a upload 4 times: plain");
	});

	it("throws when the job has no OIDC token to ask for", async () => {
		for (const env of [
			{},
			{ ACTIONS_ID_TOKEN_REQUEST_URL: "https://x" },
			{ ACTIONS_ID_TOKEN_REQUEST_TOKEN: "b" },
		]) {
			const t = setup({ files: {}, env });
			await expect(uploadCoverage(input([{ flag: "a", files: ["a"] }]), t.deps)).rejects.toThrow(
				/id-token: write/
			);
			expect(t.deps.prepareCli).not.toHaveBeenCalled();
		}
	});

	it.each([[{ flag: "", files: ["a"] }], [{ flag: "a", files: [] }], [{ flag: "a", files: [""] }]])(
		"throws for an upload with a missing flag or files (%j)",
		async (group) => {
			const t = setup({ files: {} });
			await expect(uploadCoverage(input([group]), t.deps)).rejects.toThrow(/flag and at least one files pattern/);
			expect(t.deps.prepareCli).not.toHaveBeenCalled();
		}
	);

	it("throws when create-commit or create-report fails, naming the stage", async () => {
		const silent = setup({ files: {}, cli: [{ status: 1 }] });
		await expect(uploadCoverage(input([{ flag: "a", files: ["a"] }]), silent.deps)).rejects.toThrow(
			"create-commit failed: no output"
		);
		const commit = setup({ files: {}, cli: [{ status: 1, stderr: "no commit" }] });
		await expect(uploadCoverage(input([{ flag: "a", files: ["a"] }]), commit.deps)).rejects.toThrow(
			"create-commit failed: no commit"
		);
		const report = setup({ files: {}, cli: [{}, { status: 1 }] });
		await expect(uploadCoverage(input([{ flag: "a", files: ["a"] }]), report.deps)).rejects.toThrow(
			"create-report failed: no output"
		);
	});

	it("lets a CLI that cannot be trusted stop the run", async () => {
		const t = setup({ files: {} });
		t.deps.prepareCli = async () => {
			throw new Error("digest does not match");
		};
		await expect(uploadCoverage(input([{ flag: "a", files: ["a"] }]), t.deps)).rejects.toThrow(
			/digest does not match/
		);
	});
});
