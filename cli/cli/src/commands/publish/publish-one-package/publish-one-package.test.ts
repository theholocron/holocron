import { describe, expect, it, vi } from "vitest";

import type { PublishExecResult } from "../publish.type.js";
import { DEFAULT_BACKOFF_MS, publishOnePackage } from "./publish-one-package.js";

const ENTRY = { name: "@theholocron/foo", version: "1.0.0", dir: "./packages/foo" };
const TLOG: PublishExecResult = {
	exitCode: 1,
	stdout: "",
	stderr: "npm error code TLOG_CREATE_ENTRY_ERROR\n(409) an equivalent entry already exists",
};
const OK: PublishExecResult = { exitCode: 0, stdout: "", stderr: "" };
const NOT_FOUND: PublishExecResult = { exitCode: 1, stdout: "", stderr: "404" };
const FOUND: PublishExecResult = { exitCode: 0, stdout: "1.0.0\n", stderr: "" };

function queue(results: Array<{ cmd: string; result: PublishExecResult }>) {
	const calls: string[] = [];
	const exec = async (cmd: string): Promise<PublishExecResult> => {
		calls.push(cmd);
		const next = results.shift();
		if (!next || next.cmd !== cmd) throw new Error(`unexpected ${cmd}`);
		return next.result;
	};
	return { exec, calls };
}

const base = { entry: ENTRY, publishArgs: ["--filter", "./packages/foo", "publish"], cwd: "/x" };

describe("publishOnePackage", () => {
	it("publishes on the first try", async () => {
		const { exec } = queue([{ cmd: "pnpm", result: OK }]);
		expect(await publishOnePackage({ ...base, exec, print: () => {} })).toEqual({ outcome: "published" });
	});

	it("counts a version that is on the registry after a failure as published concurrently", async () => {
		const { exec } = queue([
			{ cmd: "pnpm", result: { exitCode: 1, stdout: "", stderr: "E409" } },
			{ cmd: "npm", result: FOUND },
		]);
		expect((await publishOnePackage({ ...base, exec, print: () => {} })).outcome).toBe("concurrent");
	});

	it("does not retry a failure that is not a sigstore 409", async () => {
		const { exec, calls } = queue([
			{ cmd: "pnpm", result: { exitCode: 1, stdout: "stdout text", stderr: "" } },
			{ cmd: "npm", result: NOT_FOUND },
		]);
		const sleep = vi.fn();
		const result = await publishOnePackage({ ...base, exec, print: () => {}, sleep });
		expect(result.outcome).toBe("failed");
		expect(result).toMatchObject({ message: expect.stringContaining("stdout text") });
		expect(calls).toEqual(["pnpm", "npm"]);
		expect(sleep).not.toHaveBeenCalled();
	});

	it("says 'no output' for a silent failure", async () => {
		const { exec } = queue([
			{ cmd: "pnpm", result: { exitCode: 1, stdout: "", stderr: "" } },
			{ cmd: "npm", result: NOT_FOUND },
		]);
		const result = await publishOnePackage({ ...base, exec, print: () => {} });
		expect(result).toMatchObject({ message: expect.stringContaining("no output") });
	});

	it("retries a sigstore 409 after a backoff and succeeds", async () => {
		const { exec } = queue([
			{ cmd: "pnpm", result: TLOG },
			{ cmd: "npm", result: NOT_FOUND },
			{ cmd: "pnpm", result: OK },
		]);
		const sleep = vi.fn(async () => {});
		const lines: string[] = [];
		const result = await publishOnePackage({
			...base,
			exec,
			print: (l) => lines.push(l),
			sleep,
			backoffMs: [10, 20],
		});
		expect(result.outcome).toBe("published");
		expect(sleep).toHaveBeenCalledWith(10);
		expect(lines.join("\n")).toContain("retrying");
	});

	it("stops retrying when the view shows the version landed between tries", async () => {
		const { exec } = queue([
			{ cmd: "pnpm", result: TLOG },
			{ cmd: "npm", result: NOT_FOUND },
			{ cmd: "pnpm", result: TLOG },
			{ cmd: "npm", result: FOUND },
		]);
		const result = await publishOnePackage({
			...base,
			exec,
			print: () => {},
			sleep: async () => {},
			backoffMs: [1, 1],
		});
		expect(result.outcome).toBe("concurrent");
	});

	it("reports a tlog-conflict after every retry", async () => {
		const { exec, calls } = queue([
			{ cmd: "pnpm", result: TLOG },
			{ cmd: "npm", result: NOT_FOUND },
			{ cmd: "pnpm", result: TLOG },
			{ cmd: "npm", result: NOT_FOUND },
			{ cmd: "pnpm", result: TLOG },
			{ cmd: "npm", result: NOT_FOUND },
		]);
		const waits: number[] = [];
		const sleep = async (ms: number) => {
			waits.push(ms);
		};
		const result = await publishOnePackage({ ...base, exec, print: () => {}, sleep });
		expect(result.outcome).toBe("tlog-conflict");
		expect(calls.filter((c) => c === "pnpm")).toHaveLength(3);
		expect(waits).toEqual([...DEFAULT_BACKOFF_MS]);
	});

	it("waits for real by default", async () => {
		vi.useFakeTimers();
		try {
			const { exec } = queue([
				{ cmd: "pnpm", result: TLOG },
				{ cmd: "npm", result: NOT_FOUND },
				{ cmd: "pnpm", result: OK },
			]);
			const pending = publishOnePackage({ ...base, exec, print: () => {}, backoffMs: [50] });
			await vi.advanceTimersByTimeAsync(50);
			expect((await pending).outcome).toBe("published");
		} finally {
			vi.useRealTimers();
		}
	});
});
