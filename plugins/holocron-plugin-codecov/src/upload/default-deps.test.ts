import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubSpawn } from "./__tests__/stub-spawn.js";
import { defaultUploadDeps } from "./default-deps.js";
import { CODECOV_CLI_BASE, CODECOV_SIGNING_KEY_URL } from "./download-cli.js";

let tmp: string;
beforeEach(() => void (tmp = mkdtempSync(join(tmpdir(), "deps-test-"))));
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("defaultUploadDeps", () => {
	it("reads the OIDC variables from the given environment, empty as absent", () => {
		const deps = defaultUploadDeps({
			env: { ACTIONS_ID_TOKEN_REQUEST_URL: "https://x", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "" },
		});
		expect(deps.env("ACTIONS_ID_TOKEN_REQUEST_URL")).toBe("https://x");
		expect(deps.env("ACTIONS_ID_TOKEN_REQUEST_TOKEN")).toBeUndefined();
	});

	it("reads the process environment and uses the global fetch when given neither", () => {
		const deps = defaultUploadDeps();
		expect(deps.env("PATH")).toBeDefined();
		expect(deps.fetch).toBe(fetch);
	});

	it("reads and writes files, makes scratch folders under the given folder and masks through the log", () => {
		const lines: string[] = [];
		const deps = defaultUploadDeps({ tmp, write: (l) => void lines.push(l) });
		const dir = deps.makeTempDir();
		expect(dir.startsWith(join(tmp, "codecov-reports-"))).toBe(true);
		deps.writeFile(join(dir, "a.info"), "SF:a\n");
		expect(deps.readFile(join(dir, "a.info"))).toBe("SF:a\n");
		deps.mask("tok");
		deps.log("hello");
		expect(lines).toEqual(["::add-mask::tok", "hello"]);
		expect(deps.expandGlob("*.info", dir)).toEqual(["a.info"]);
	});

	it("writes progress to stdout when no writer is given", () => {
		const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		defaultUploadDeps({ tmp }).log("line");
		expect(write).toHaveBeenCalledWith("line\n");
		write.mockRestore();
	});

	it("sleeps for the time given", async () => {
		vi.useFakeTimers();
		const done = vi.fn();
		void defaultUploadDeps({ tmp }).sleep(1000).then(done);
		await vi.advanceTimersByTimeAsync(999);
		expect(done).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(done).toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("prepares a checked, executable Codecov CLI that runs with the inherited environment", async () => {
		const binary = new TextEncoder().encode("bin");
		const digest = createHash("sha256").update(binary).digest("hex");
		const bodies: Record<string, Uint8Array> = {
			[`${CODECOV_CLI_BASE}/codecov`]: binary,
			[`${CODECOV_CLI_BASE}/codecov.SHA256SUM`]: new TextEncoder().encode(`${digest}  codecov\n`),
			[`${CODECOV_CLI_BASE}/codecov.SHA256SUM.sig`]: new TextEncoder().encode("sig"),
			[CODECOV_SIGNING_KEY_URL]: new TextEncoder().encode("key"),
		};
		const fetchStub = (async (url: string) => {
			const body = bodies[url] as Uint8Array;
			return {
				ok: true,
				status: 200,
				arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
			};
		}) as unknown as typeof fetch;
		const spawn = stubSpawn();
		const deps = defaultUploadDeps({ tmp, fetch: fetchStub, spawn: spawn.spawn, env: { PATH: "/bin" } });
		const cli = await deps.prepareCli();
		const gpgHome = spawn.calls[0]?.args[1] as string;
		const dir = join(gpgHome, "..");
		expect(statSync(gpgHome).mode & 0o777).toBe(0o700);
		expect(statSync(join(dir, "codecov")).mode & 0o111).not.toBe(0);
		expect(readFileSync(join(dir, "codecov"), "utf-8")).toBe("bin");
		expect(existsSync(join(dir, "codecov.SHA256SUM.sig"))).toBe(true);
		cli.createCommit("tok");
		expect(spawn.calls.at(-1)).toMatchObject({
			binary: join(dir, "codecov"),
			env: { PATH: "/bin", CODECOV_TOKEN: "tok" },
		});
	});
});
