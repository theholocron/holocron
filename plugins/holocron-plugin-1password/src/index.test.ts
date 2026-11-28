import { describe, expect, it } from "vitest";

import { stubSpawn } from "./helpers.js";
import { AuthError, createPlugin, OpCredentials, OpVault } from "./index.js";

describe("createPlugin", () => {
	it("does not need a `vault` option", () => {
		const { spawn } = stubSpawn([{ status: 0, stdout: "2.30.0" }]);
		const plugin = createPlugin({ spawn });
		expect(plugin.capabilities.vault()).toBeInstanceOf(OpVault);
	});

	it("throws AuthError when `op` is missing from PATH", () => {
		const { spawn } = stubSpawn([{ error: new Error("spawn ENOENT") }]);
		expect(() => createPlugin({ vault: "rando", spawn })).toThrow(AuthError);
	});

	it("offers the connection and export-environment probes, the latter a writer", () => {
		const { spawn } = stubSpawn([{ status: 0, stdout: "2.30.0" }]);
		const plugin = createPlugin({ spawn, repoRoot: "/repo" });
		expect(Object.keys(plugin.probes).sort()).toEqual(["connection", "export-environment"]);
		expect(plugin.probes["export-environment"].writes).toBe(true);
	});

	it("falls back to the working directory when the CLI hands no repo root", () => {
		const { spawn } = stubSpawn([{ status: 0, stdout: "2.30.0" }]);
		expect(createPlugin({ spawn }).probes["export-environment"].summary).toMatch(/Environment/);
	});

	it("wires the credentials capability", () => {
		const { spawn } = stubSpawn([{ status: 0, stdout: "2.30.0" }]);
		const plugin = createPlugin({ spawn });
		expect(plugin.capabilities.credentials()).toBeInstanceOf(OpCredentials);
	});

	it("hands the `environment` option to the vault, so a variable is read by its bare name", async () => {
		const { spawn } = stubSpawn([
			{ status: 0, stdout: "2.30.0" },
			{ status: 0, stdout: "COMLINK_SENTRY_SECRET=s3cret" },
		]);
		const plugin = createPlugin({ environment: "Comlink", spawn });
		expect(await plugin.capabilities.vault().readSecret?.("COMLINK_SENTRY_SECRET")).toBe("s3cret");
	});

	it("wires the vault capability", () => {
		const { spawn } = stubSpawn([{ status: 0, stdout: "2.30.0" }]);
		const plugin = createPlugin({ vault: "rando", spawn });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-1password");
		expect(plugin.capabilities.vault()).toBeInstanceOf(OpVault);
	});

	it("passes account UUID through to the shell", async () => {
		const { spawn, calls } = stubSpawn([
			{ status: 0, stdout: "2.30.0" }, // verifyOpInstalled
			{ status: 0, stdout: "value" }, // first vault.read
		]);
		const plugin = createPlugin({
			vault: "rando",
			account: "ABCDEF",
			spawn,
		});
		await plugin.capabilities.vault().read("op://rando/X/v");
		// calls[0] is --version (no --account); calls[1] is the read.
		expect(calls[1]?.args).toEqual(["--account", "ABCDEF", "read", "op://rando/X/v", "--no-newline"]);
	});
});
