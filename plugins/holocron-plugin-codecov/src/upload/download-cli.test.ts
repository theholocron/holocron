import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { stubSpawn } from "./__tests__/stub-spawn.js";
import { CODECOV_CLI_BASE, CODECOV_SIGNING_KEY_URL, downloadCli } from "./download-cli.js";

const BINARY = new TextEncoder().encode("#!codecov-binary");
const DIGEST = createHash("sha256").update(BINARY).digest("hex");

function setup(over: { sums?: string; fetchStatus?: Record<string, number[]>; gpg?: Array<{ status?: number }> } = {}) {
	const bodies: Record<string, Uint8Array> = {
		[`${CODECOV_CLI_BASE}/codecov`]: BINARY,
		[`${CODECOV_CLI_BASE}/codecov.SHA256SUM`]: new TextEncoder().encode(over.sums ?? `${DIGEST}  codecov\n`),
		[`${CODECOV_CLI_BASE}/codecov.SHA256SUM.sig`]: new TextEncoder().encode("SIG"),
		[CODECOV_SIGNING_KEY_URL]: new TextEncoder().encode("KEY"),
	};
	const seen: string[] = [];
	const statuses = { ...over.fetchStatus };
	const fetchStub = (async (url: string) => {
		seen.push(url);
		const status = statuses[url]?.shift() ?? 200;
		const body = bodies[url] as Uint8Array;
		return {
			ok: status === 200,
			status,
			arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
		};
	}) as unknown as typeof fetch;
	const written: Record<string, string> = {};
	const dirs: Array<[string, number | undefined]> = [];
	const executable: string[] = [];
	const spawn = stubSpawn(over.gpg ?? [{ status: 0 }, { status: 0 }]);
	const sleep = vi.fn(async () => {});
	const deps = {
		fetch: fetchStub,
		spawn: spawn.spawn,
		writeFile: (path: string, data: Uint8Array | string) => {
			written[path] = typeof data === "string" ? data : new TextDecoder().decode(data);
		},
		makeExecutable: (path: string) => void executable.push(path),
		makeDir: (path: string, mode?: number) => void dirs.push([path, mode]),
	};
	return { deps, seen, written, dirs, executable, spawn, sleep };
}

describe("downloadCli", () => {
	it("downloads, checks the signature and the digest, and only then makes the binary executable", async () => {
		const t = setup();
		await expect(downloadCli({ dir: "/w/cli", deps: t.deps, sleep: t.sleep })).resolves.toBe("/w/cli/codecov");
		expect(t.seen).toEqual([
			`${CODECOV_CLI_BASE}/codecov`,
			`${CODECOV_CLI_BASE}/codecov.SHA256SUM`,
			`${CODECOV_CLI_BASE}/codecov.SHA256SUM.sig`,
			CODECOV_SIGNING_KEY_URL,
		]);
		expect(t.dirs).toEqual([
			["/w/cli", undefined],
			["/w/cli/gnupg", 0o700],
		]);
		expect(Object.keys(t.written).sort()).toEqual([
			"/w/cli/codecov",
			"/w/cli/codecov.SHA256SUM",
			"/w/cli/codecov.SHA256SUM.sig",
		]);
		expect(t.spawn.calls[0]).toMatchObject({ binary: "gpg", input: "KEY" });
		expect(t.executable).toEqual(["/w/cli/codecov"]);
	});

	it("tries a download again after a failed answer, waiting 1 s times the try", async () => {
		const t = setup({ fetchStatus: { [`${CODECOV_CLI_BASE}/codecov`]: [503, 502] } });
		await downloadCli({ dir: "/w/cli", deps: t.deps, sleep: t.sleep });
		expect(t.seen.filter((u) => u.endsWith("/codecov"))).toHaveLength(3);
		expect(t.sleep.mock.calls).toEqual([[1000], [2000]]);
	});

	it("gives up on a download after three tries, naming the URL", async () => {
		const t = setup({ fetchStatus: { [CODECOV_SIGNING_KEY_URL]: [500, 500, 500] } });
		await expect(downloadCli({ dir: "/w/cli", deps: t.deps, sleep: t.sleep })).rejects.toThrow(
			/keybase\.io.*answered 500/
		);
		expect(t.executable).toEqual([]);
	});

	it("refuses a checksum file gpg does not accept, and runs nothing", async () => {
		const t = setup({ gpg: [{ status: 0 }, { status: 1 }] });
		await expect(downloadCli({ dir: "/w/cli", deps: t.deps, sleep: t.sleep })).rejects.toThrow(
			/not signed by Codecov/
		);
		expect(t.executable).toEqual([]);
	});

	it("refuses a checksum file with no digest for the binary", async () => {
		const t = setup({ sums: `${DIGEST}  other\n` });
		await expect(downloadCli({ dir: "/w/cli", deps: t.deps, sleep: t.sleep })).rejects.toThrow(
			/no digest for `codecov`/
		);
		expect(t.executable).toEqual([]);
	});

	it("refuses a binary whose digest differs", async () => {
		const t = setup({ sums: `${"0".repeat(64)}  codecov\n` });
		await expect(downloadCli({ dir: "/w/cli", deps: t.deps, sleep: t.sleep })).rejects.toThrow(
			/digest does not match/
		);
		expect(t.executable).toEqual([]);
	});
});
