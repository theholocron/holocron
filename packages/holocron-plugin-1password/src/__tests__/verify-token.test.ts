import { describe, expect, it, vi } from "vitest";

import { verifyToken } from "../verify-token.js";

function makeSpawn(result: {
	status?: number | null;
	stdout?: string;
	stderr?: string;
	error?: Error;
}): typeof import("node:child_process").spawnSync {
	return vi.fn(() => ({
		status: result.status ?? 0,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		error: result.error,
		pid: 0,
		output: [],
		signal: null,
	})) as unknown as typeof import("node:child_process").spawnSync;
}

describe("verifyToken (1password)", () => {
	it("returns ok with the parsed email when op whoami succeeds", async () => {
		const spawn = makeSpawn({
			status: 0,
			stdout: JSON.stringify({ email: "cnewton@example.com", url: "https://my.1password.com" }),
		});
		const result = await verifyToken("ignored-token", { spawn });
		expect(result.ok).toBe(true);
		expect((result as { ok: boolean; subject?: string; message?: string }).subject).toMatch(/cnewton@example.com/);
	});

	it("falls back to url / uuid when email is absent", async () => {
		const spawn = makeSpawn({
			status: 0,
			stdout: JSON.stringify({ user_uuid: "ABC123" }),
		});
		const result = await verifyToken("", { spawn });
		expect(result.ok).toBe(true);
		expect((result as { ok: boolean; subject?: string; message?: string }).subject).toMatch(/ABC123/);
	});

	it("returns ok with a generic subject when stdout is not JSON", async () => {
		const spawn = makeSpawn({ status: 0, stdout: "not json" });
		const result = await verifyToken("", { spawn });
		expect(result.ok).toBe(true);
		expect((result as { ok: boolean; subject?: string; message?: string }).subject).toMatch(/signed in/);
	});

	it("returns ok:false when the op binary is missing", async () => {
		const spawn = makeSpawn({ error: new Error("ENOENT") });
		const result = await verifyToken("", { spawn });
		expect(result.ok).toBe(false);
		expect((result as { ok: boolean; subject?: string; message?: string }).message).toMatch(/not found on PATH/);
	});

	it("returns ok:false when op whoami exits non-zero (not signed in)", async () => {
		const spawn = makeSpawn({ status: 1, stderr: "You are not currently signed in." });
		const result = await verifyToken("", { spawn });
		expect(result.ok).toBe(false);
		expect((result as { ok: boolean; subject?: string; message?: string }).message).toMatch(
			/not currently signed in/
		);
	});

	it("includes exit code in error when op whoami exits non-zero with no stderr", async () => {
		const spawn = makeSpawn({ status: 3 });
		const result = await verifyToken("", { spawn });
		expect(result.ok).toBe(false);
		expect((result as { ok: boolean; subject?: string; message?: string }).message).toMatch(/exit 3/);
	});

	it("returns ok with generic subject when whoami output has no identity fields", async () => {
		const spawn = makeSpawn({ status: 0, stdout: JSON.stringify({ account_uuid: "acc_1" }) });
		const result = await verifyToken("", { spawn });
		expect(result.ok).toBe(true);
		expect((result as { ok: boolean; subject?: string; message?: string }).subject).toMatch(/signed in/);
	});

	it("handles null stdout as empty object (falls back to generic subject)", async () => {
		const spawn = vi.fn(() => ({
			status: 0,
			stdout: null,
			stderr: null,
			pid: 0,
			output: [],
			signal: null,
		})) as unknown as typeof import("node:child_process").spawnSync;
		const result = await verifyToken("", { spawn });
		expect(result.ok).toBe(true);
		expect((result as { subject?: string }).subject).toMatch(/signed in/);
	});

	it("includes '?' when status is null and stderr is null", async () => {
		const spawn = vi.fn(() => ({
			status: null,
			stdout: null,
			stderr: null,
			pid: 0,
			output: [],
			signal: null,
		})) as unknown as typeof import("node:child_process").spawnSync;
		const result = await verifyToken("", { spawn });
		expect(result.ok).toBe(false);
		expect((result as { message?: string }).message).toMatch(/exit \?/);
	});

	it("uses real spawnSync when spawn is not provided (covers ?? spawnSync branch)", async () => {
		const result = await verifyToken("", { binary: "nonexistent_binary_xyzzy_abc123" });
		expect(result.ok).toBe(false);
		expect((result as { message?: string }).message).toMatch(/not found on PATH/);
	});
});
