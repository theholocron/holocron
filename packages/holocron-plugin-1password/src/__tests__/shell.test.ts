import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { OpShell } from "../shell.js";

import { stubSpawn } from "./helpers.js";

describe("OpShell.run", () => {
	it("shells out to `op` with the given args + uniform OpResult", () => {
		const { spawn, calls } = stubSpawn([{ status: 0, stdout: "iamnewton@example.com" }]);
		const shell = new OpShell({ spawn });
		const result = shell.run(["whoami"]);
		expect(calls[0]?.binary).toBe("op");
		expect(calls[0]?.args).toEqual(["whoami"]);
		expect(result).toEqual({ ok: true, stdout: "iamnewton@example.com", stderr: "" });
	});

	it("returns ok:false on non-zero exit", () => {
		const { spawn } = stubSpawn([{ status: 1, stderr: "not signed in" }]);
		const shell = new OpShell({ spawn });
		const result = shell.run(["read", "op://x/y/z"]);
		expect(result.ok).toBe(false);
		expect(result.stderr).toBe("not signed in");
	});

	it("wraps spawn-level errors as ok:false", () => {
		const { spawn } = stubSpawn([{ error: new Error("spawn EACCES") }]);
		const shell = new OpShell({ spawn });
		const result = shell.run(["whoami"]);
		expect(result.ok).toBe(false);
		expect(result.stderr).toBe("spawn EACCES");
	});

	it("injects --account when configured", () => {
		const { spawn, calls } = stubSpawn([{ status: 0, stdout: "" }]);
		const shell = new OpShell({ spawn, account: "ACCOUNT_UUID" });
		shell.run(["read", "op://x/y/z"]);
		expect(calls[0]?.args).toEqual(["--account", "ACCOUNT_UUID", "read", "op://x/y/z"]);
	});

	it("skips --account when `skipAccount: true` (for `op account list`)", () => {
		const { spawn, calls } = stubSpawn([{ status: 0, stdout: "[]" }]);
		const shell = new OpShell({ spawn, account: "ACCOUNT_UUID" });
		shell.run(["account", "list", "--format=json"], { skipAccount: true });
		expect(calls[0]?.args).toEqual(["account", "list", "--format=json"]);
	});

	it("honors the binary override", () => {
		const { spawn, calls } = stubSpawn([{ status: 0, stdout: "" }]);
		const shell = new OpShell({ spawn, binary: "/custom/op" });
		shell.run(["whoami"]);
		expect(calls[0]?.binary).toBe("/custom/op");
	});
});

describe("OpShell.runOrThrow", () => {
	it("returns stdout on success", () => {
		const { spawn } = stubSpawn([{ status: 0, stdout: "value" }]);
		const shell = new OpShell({ spawn });
		expect(shell.runOrThrow(["read", "op://x/y/z"], "read x")).toBe("value");
	});

	it("throws ProviderApiError(status=0) on non-zero exit", () => {
		const { spawn } = stubSpawn([{ status: 1, stderr: "item not found" }]);
		const shell = new OpShell({ spawn });
		const err = (() => { try { shell.runOrThrow(["read", "op://x/y/z"], "read x"); } catch (e) { return e; } })() as ProviderApiError;
		expect(err).toBeInstanceOf(ProviderApiError);
		const pae = err as ProviderApiError;
		expect(pae.status).toBe(0);
		expect(pae.message).toContain("1Password read x failed");
		expect(pae.message).toContain("item not found");
	});
});
