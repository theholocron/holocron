import type { spawnSync } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

// Nothing here may start a real `op`.
const spawnSyncMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawnSync: spawnSyncMock }));

import { loadDevEnv } from "./dev-env.js";

const ALL = { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: "KEY", SENTINEL_WEBHOOK_SECRET: "WS" };

const op = (status: number, stdout = "", stderr = "") =>
	vi.fn(() => ({ status, stdout, stderr, error: undefined })) as unknown as typeof spawnSync &
		ReturnType<typeof vi.fn>;

describe("loadDevEnv", () => {
	it("uses the process as it is, and does not run op, when the three are already set", () => {
		const spawn = op(0);
		const env = loadDevEnv({ environment: "Sentinel - dev", env: { ...ALL, OTHER: "x" }, spawn });
		expect(env).toMatchObject({ ...ALL, OTHER: "x" });
		expect(spawn).not.toHaveBeenCalled();
	});

	it("reads the rest from the 1Password Environment, with the values revealed", () => {
		const spawn = op(
			0,
			'GITHUB_APP_ID=2\nGITHUB_APP_PRIVATE_KEY="-----BEGIN-----\\nAAAA\\n-----END-----"\nSENTINEL_WEBHOOK_SECRET=ws2\n'
		);
		const env = loadDevEnv({ environment: "Sentinel - dev", env: {}, spawn });
		expect(env.GITHUB_APP_ID).toBe("2");
		expect(env.GITHUB_APP_PRIVATE_KEY).toContain("AAAA");
		expect(env.SENTINEL_WEBHOOK_SECRET).toBe("ws2");
		expect(spawn).toHaveBeenCalledWith(
			"op",
			["environment", "secret", "list", "Sentinel - dev", "--reveal", "--format=dotenv"],
			expect.objectContaining({ encoding: "utf8" })
		);
	});

	it("lets a variable already in the process win over the Environment, and ignores an empty one", () => {
		const spawn = op(0, "GITHUB_APP_ID=2\nGITHUB_APP_PRIVATE_KEY=K\nSENTINEL_WEBHOOK_SECRET=ws2\n");
		const env = loadDevEnv({ environment: "E", env: { GITHUB_APP_ID: "9", SENTINEL_WEBHOOK_SECRET: "" }, spawn });
		expect(env.GITHUB_APP_ID).toBe("9");
		expect(env.SENTINEL_WEBHOOK_SECRET).toBe("ws2");
	});

	it("names the variables that are in neither place, and no value", () => {
		const spawn = op(0, "GITHUB_APP_ID=2\n");
		const err = (() => {
			try {
				loadDevEnv({ environment: "Sentinel - dev", env: {}, spawn });
			} catch (e) {
				return e as Error;
			}
		})();
		expect(err?.message).toBe(
			'missing from the environment and from "Sentinel - dev": GITHUB_APP_PRIVATE_KEY, SENTINEL_WEBHOOK_SECRET'
		);
	});

	it("says why op failed, from its first line of stderr", () => {
		const spawn = op(1, "", "[ERROR] environment not found\nmore");
		expect(() => loadDevEnv({ environment: "Nope", env: {}, spawn })).toThrow(
			'could not read the 1Password Environment "Nope": [ERROR] environment not found'
		);
	});

	it("says op failed when it gives no reason, and when it cannot be started", () => {
		expect(() => loadDevEnv({ environment: "E", env: {}, spawn: op(1) })).toThrow(/: op failed$/);
		const missing = vi.fn(() => ({
			status: null,
			error: new Error("spawn op ENOENT"),
		})) as unknown as typeof spawnSync;
		expect(() => loadDevEnv({ environment: "E", env: {}, spawn: missing })).toThrow(/spawn op ENOENT/);
	});

	it("reads process.env and the platform's spawnSync when none are given", () => {
		const saved = { ...process.env };
		for (const k of Object.keys(ALL)) delete process.env[k];
		spawnSyncMock.mockReturnValueOnce({
			status: 0,
			stdout: "GITHUB_APP_ID=3\nGITHUB_APP_PRIVATE_KEY=K\nSENTINEL_WEBHOOK_SECRET=W\n",
			stderr: "",
		});
		try {
			expect(loadDevEnv({ environment: "E" }).GITHUB_APP_ID).toBe("3");
			expect(spawnSyncMock).toHaveBeenCalledTimes(1);
		} finally {
			Object.assign(process.env, saved);
		}
	});
});
