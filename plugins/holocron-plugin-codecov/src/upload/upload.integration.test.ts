import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { stubSpawn } from "./__tests__/stub-spawn.js";
import { defaultUploadDeps } from "./default-deps.js";
import { CODECOV_CLI_BASE, CODECOV_SIGNING_KEY_URL } from "./download-cli.js";
import { uploadCoverage } from "./upload-coverage.js";

/**
 * The whole path with the real file system and glob, and only the network and the child processes stubbed: a repo of
 * fake lcov files, a download that verifies, and a Codecov CLI that records what it was asked to upload.
 */
describe("uploadCoverage over a repo of lcov files", () => {
	let repo: string;
	let tmp: string;
	beforeEach(() => {
		repo = mkdtempSync(join(tmpdir(), "repo-"));
		tmp = mkdtempSync(join(tmpdir(), "scratch-"));
		const write = (path: string, text: string) => {
			mkdirSync(join(repo, path, ".."), { recursive: true });
			writeFileSync(join(repo, path), text);
		};
		write("utils/a-utils/coverage/lcov.info", "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record\n");
		write("utils/b-utils/coverage/lcov.info", "TN:\nSF:src/index.ts\nSF:/abs/keep.ts\nend_of_record\n");
		write("utils/empty-utils/coverage/lcov.info", "TN:\nend_of_record\n");
		write("skills/lcov.info", "SF:index.ts\n");
	});
	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
		rmSync(tmp, { recursive: true, force: true });
	});

	it("uploads rooted copies per flag, with a fresh masked token each time and none in argv", async () => {
		const binary = new TextEncoder().encode("codecov-cli");
		const digest = createHash("sha256").update(binary).digest("hex");
		const bodies: Record<string, string | Uint8Array> = {
			[`${CODECOV_CLI_BASE}/codecov`]: binary,
			[`${CODECOV_CLI_BASE}/codecov.SHA256SUM`]: `${digest}  codecov\n`,
			[`${CODECOV_CLI_BASE}/codecov.SHA256SUM.sig`]: "sig",
			[CODECOV_SIGNING_KEY_URL]: "key",
		};
		let tokens = 0;
		const fetchStub = (async (url: string) => {
			if (url.startsWith("https://run.test/oidc")) {
				return { ok: true, status: 200, json: async () => ({ value: `oidc-secret-${++tokens}` }) };
			}
			const body = bodies[url];
			const bytes = typeof body === "string" ? new TextEncoder().encode(body) : (body as Uint8Array);
			return {
				ok: true,
				status: 200,
				arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
			};
		}) as unknown as typeof fetch;
		const spawn = stubSpawn();
		const lines: string[] = [];
		const uploaded: Record<string, string> = {};
		const deps = defaultUploadDeps({
			env: {
				ACTIONS_ID_TOKEN_REQUEST_URL: "https://run.test/oidc?x=1",
				ACTIONS_ID_TOKEN_REQUEST_TOKEN: "bearer",
			},
			fetch: fetchStub,
			spawn: spawn.spawn,
			tmp,
			write: (line) => void lines.push(line),
		});
		// Capture what each rooted copy held when the CLI was asked to upload it.
		const readFile = deps.readFile;
		deps.writeFile = ((write) => (path: string, data: string) => {
			write(path, data);
			uploaded[path] = readFileSync(path, "utf-8");
		})(deps.writeFile);

		const result = await uploadCoverage(
			{
				uploads: [
					{ flag: "utils", files: ["utils/*/coverage/lcov.info"] },
					{ flag: "skills", files: ["skills/lcov.info"] },
					{ flag: "none", files: ["nothing/*.info"] },
				],
				repoRoot: repo,
			},
			deps
		);

		expect(readFile).toBeTypeOf("function");
		expect(result).toEqual({
			flags: [
				{
					flag: "utils",
					outcome: "uploaded",
					files: 2,
					notes: ["utils/empty-utils/coverage/lcov.info names no source file, left out"],
				},
				{ flag: "skills", outcome: "uploaded", files: 1, notes: [] },
				{ flag: "none", outcome: "skipped", files: 0, notes: ["no coverage files"] },
			],
			uploaded: 2,
		});
		const copies = Object.values(uploaded);
		expect(copies).toContain("TN:\nSF:utils/a-utils/src/index.ts\nDA:1,1\nend_of_record\n");
		expect(copies).toContain("TN:\nSF:utils/b-utils/src/index.ts\nSF:/abs/keep.ts\nend_of_record\n");
		expect(copies).toContain("SF:skills/index.ts\n");
		const cliCalls = spawn.calls.filter((c) => c.binary.endsWith("/codecov"));
		expect(cliCalls.map((c) => c.args[0])).toEqual(["create-commit", "create-report", "do-upload", "do-upload"]);
		expect(cliCalls.map((c) => c.env?.CODECOV_TOKEN)).toEqual([
			"oidc-secret-1",
			"oidc-secret-1",
			"oidc-secret-2",
			"oidc-secret-3",
		]);
		expect(JSON.stringify(cliCalls.map((c) => c.args))).not.toContain("oidc-secret");
		expect(lines.filter((l) => l.startsWith("::add-mask::"))).toEqual([
			"::add-mask::oidc-secret-1",
			"::add-mask::oidc-secret-2",
			"::add-mask::oidc-secret-3",
		]);
		expect(lines.filter((l) => !l.startsWith("::add-mask::"))).toEqual([
			"→ utils: 2 file(s)",
			"→ skills: 1 file(s)",
			"· none: no coverage files",
		]);
	});
});
