import { describe, expect, it, vi } from "vitest";

import { AuthError, verifyOpInstalled } from "../auth.js";
import { stubSpawn } from "./helpers.js";

describe("verifyOpInstalled", () => {
	it("returns silently when `op --version` succeeds", () => {
		const { spawn, calls } = stubSpawn([{ status: 0, stdout: "2.30.0" }]);
		expect(() => verifyOpInstalled({ spawn })).not.toThrow();
		expect(calls[0]?.binary).toBe("op");
		expect(calls[0]?.args).toEqual(["--version"]);
	});

	it("honors the binary override", () => {
		const { spawn, calls } = stubSpawn([{ status: 0, stdout: "2.30.0" }]);
		verifyOpInstalled({ spawn, binary: "/usr/local/bin/op" });
		expect(calls[0]?.binary).toBe("/usr/local/bin/op");
	});

	it("throws AuthError with an install hint when spawn returns ENOENT", () => {
		const { spawn } = stubSpawn([{ error: new Error("spawn ENOENT") }]);
		const err = (() => {
			try {
				verifyOpInstalled({ spawn });
			} catch (e) {
				return e;
			}
		})() as AuthError;
		expect(err).toBeInstanceOf(AuthError);
		expect((err as AuthError).message).toMatch(/brew install 1password-cli/);
	});

	it("throws AuthError when `op --version` exits non-zero", () => {
		const { spawn } = stubSpawn([{ status: 1, stderr: "something is busted" }]);
		const err = (() => {
			try {
				verifyOpInstalled({ spawn });
			} catch (e) {
				return e;
			}
		})() as AuthError;
		expect(err).toBeInstanceOf(AuthError);
		expect((err as AuthError).message).toMatch(/something is busted/);
	});

	it("includes exit code in error when `op --version` exits non-zero with no stderr", () => {
		const { spawn } = stubSpawn([{ status: 2 }]);
		const err = (() => {
			try {
				verifyOpInstalled({ spawn });
			} catch (e) {
				return e;
			}
		})() as AuthError;
		expect(err).toBeInstanceOf(AuthError);
		expect((err as AuthError).message).toMatch(/exit 2/);
	});

	it("includes '?' in error message when status is null", () => {
		const spawn = vi.fn(() => ({
			pid: 0,
			output: [],
			stdout: "",
			stderr: "",
			status: null,
			signal: null,
		})) as unknown as typeof import("node:child_process").spawnSync;
		const err = (() => {
			try {
				verifyOpInstalled({ spawn });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(AuthError);
		expect((err as AuthError).message).toMatch(/exit \?/);
	});

	it("uses real spawnSync when spawn override is not provided (covers ?? spawnSync branch)", () => {
		const err = (() => {
			try {
				verifyOpInstalled({ binary: "nonexistent_binary_xyzzy_abc123" });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(AuthError);
	});
});
