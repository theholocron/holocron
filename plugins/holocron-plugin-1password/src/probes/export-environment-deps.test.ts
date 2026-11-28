import { copyToClipboard, isGitIgnored, shredFile, writeCredentialsFile } from "@theholocron/kyber/secrets";
import { describe, expect, it, vi } from "vitest";

import { OpCredentials } from "../capabilities/credentials.js";
import { stubSpawn } from "../helpers.js";
import { OpShell } from "../shell.js";
import { exportEnvironmentDeps } from "./export-environment-deps.js";

describe("exportEnvironmentDeps", () => {
	it("reads through `op environment secret list --reveal`, with the plugin's own reader", async () => {
		const { spawn, calls } = stubSpawn([{ status: 0, stdout: "A=one\nB=two" }]);
		const deps = exportEnvironmentDeps(new OpCredentials(new OpShell({ spawn })), "/repo");
		expect(await deps.read("Holocron")).toEqual({ A: "one", B: "two" });
		expect(calls[0]!.args).toEqual(["environment", "secret", "list", "Holocron", "--reveal", "--format=dotenv"]);
		expect(deps.repoRoot).toBe("/repo");
	});

	it("uses the shared secret-file helpers", () => {
		const deps = exportEnvironmentDeps(new OpCredentials(new OpShell()), "/repo");
		expect(deps.copy).toBe(copyToClipboard);
		expect(deps.writeFile).toBe(writeCredentialsFile);
		expect(deps.shred).toBe(shredFile);
		expect(deps.isIgnored).toBe(isGitIgnored);
	});

	it("leaves a name that is not a layer word as written, and reports this process's streams", async () => {
		const deps = exportEnvironmentDeps(new OpCredentials(new OpShell()), "/repo");
		expect(await deps.resolveId("Sentinel - dev", "/repo")).toBe("Sentinel - dev");
		expect(["terminal", "pipe", "other"]).toContain(deps.outKind());
		expect(typeof deps.interactive).toBe("boolean");
		expect(deps.platform).toBe(process.platform);
		const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		deps.out("x\n");
		expect(write).toHaveBeenCalledWith("x\n");
		write.mockRestore();
	});
});
