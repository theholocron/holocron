import { describe, expect, it } from "vitest";

import { buildSyncCommand, FALLBACK_PATH } from "./build-sync-command.js";

describe("buildSyncCommand", () => {
	it("builds the sync line, the vault variable and a PATH with fallbacks, and no token", () => {
		const command = buildSyncCommand({ command: "pnpm exec holocron", repoPath: " /repo " }, "/vault", "/usr/sbin");
		expect(command).toEqual({
			program: "pnpm",
			args: ["exec", "holocron", "ideas", "sync", "--yes"],
			cwd: "/repo",
			env: { HOLOCRON_IDEAS_DIR: "/vault", PATH: `/usr/sbin:${FALLBACK_PATH.join(":")}` },
		});
	});

	it("leaves out an empty current PATH", () => {
		expect(buildSyncCommand({ command: "holocron", repoPath: "/r" }, "/v", "")?.env.PATH).toBe(
			FALLBACK_PATH.join(":")
		);
	});

	it("returns undefined for an empty command", () => {
		expect(buildSyncCommand({ command: " ", repoPath: "/r" }, "/v", "")).toBeUndefined();
	});
});
