import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })) }));

import { defaultExec } from "./default-exec.js";
import { runPublish } from "./run-publish/index.js";

// ── defaultExec ───────────────────────────────────────────────────────────────

describe("defaultExec (publish)", () => {
	it("calls spawnSync and returns captured output when exec is not injected", async () => {
		const { spawnSync } = await import("node:child_process");
		const spy = spawnSync as ReturnType<typeof vi.fn>;
		spy.mockReturnValue({ status: 0, stdout: "iamnewton\n", stderr: "" });

		// Without injecting exec, runPublish uses defaultExec → spawnSync.
		// npm whoami runs first; return a valid user so the publish proceeds.
		const report = await runPublish({ cwd: "/tmp", env: { npm_config_userconfig: "/dev/null" } });

		expect(spy).toHaveBeenCalled();
		// status reflects the spawnSync exit code path
		expect(["ok", "fail"]).toContain(report.status);
	});

	it("surfaces null spawnSync status as exit code -1 (→ fail)", async () => {
		const { spawnSync } = await import("node:child_process");
		const spy = spawnSync as ReturnType<typeof vi.fn>;
		spy.mockReturnValue({ status: null, stdout: "", stderr: "error" });

		const report = await runPublish({ cwd: "/tmp", env: {} });
		// null status → exitCode -1 → treated as non-zero → fail
		expect(report.status).toBe("fail");
	});

	it("strips HOLOCRON_OTP from the spawned process's env (holocron#1076 review) — never inherited by npm/pnpm or its lifecycle scripts", async () => {
		const { spawnSync } = await import("node:child_process");
		const spy = spawnSync as ReturnType<typeof vi.fn>;
		spy.mockClear();
		spy.mockReturnValue({ status: 0, stdout: "", stderr: "" });
		process.env.HOLOCRON_OTP = "123456";
		process.env.HOLOCRON_UNRELATED_TEST_VAR = "keep-me";
		try {
			await defaultExec("npm", ["whoami"], { cwd: "/tmp" });
		} finally {
			delete process.env.HOLOCRON_OTP;
			delete process.env.HOLOCRON_UNRELATED_TEST_VAR;
		}
		expect(spy).toHaveBeenCalledTimes(1);
		const passedEnv = spy.mock.calls[0]?.[2]?.env as Record<string, string | undefined>;
		expect(passedEnv.HOLOCRON_OTP).toBeUndefined();
		expect(passedEnv.HOLOCRON_UNRELATED_TEST_VAR).toBe("keep-me");
	});
});
