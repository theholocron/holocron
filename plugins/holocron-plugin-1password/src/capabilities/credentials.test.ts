import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it, vi } from "vitest";

import { stubSpawn } from "../helpers.js";
import { OpShell } from "../shell.js";
import { OpCredentials, READ_TIMEOUT_MS, spellings } from "./credentials.js";

const NOT_FOUND = { status: 1, stderr: "[ERROR] 2026/11/02 12:45:39 environment couldn't be found" };

function makeCredentials(responses: Parameters<typeof stubSpawn>[0]) {
	const { spawn, calls, mock } = stubSpawn(responses);
	return { credentials: new OpCredentials(new OpShell({ spawn })), calls, mock };
}

describe("spellings", () => {
	it("is the name as written, then lowercase, Title case and UPPERCASE, without repeats", () => {
		expect(spellings("holocron")).toEqual(["holocron", "Holocron", "HOLOCRON"]);
		expect(spellings("Holocron")).toEqual(["Holocron", "holocron", "HOLOCRON"]);
		expect(spellings("HoloCron")).toEqual(["HoloCron", "holocron", "Holocron", "HOLOCRON"]);
	});
});

describe("OpCredentials.read", () => {
	it("reads the variables through `op environment secret list --reveal --format=dotenv`", async () => {
		const { credentials, calls } = makeCredentials([{ status: 0, stdout: "HOLOCRON_ORG_TOKEN=abc\nB=two words" }]);
		expect(await credentials.read("Holocron")).toEqual({ HOLOCRON_ORG_TOKEN: "abc", B: "two words" });
		expect(calls).toEqual([
			{
				binary: "op",
				args: ["environment", "secret", "list", "Holocron", "--reveal", "--format=dotenv"],
			},
		]);
	});

	it("is a provider of the credentials capability", () => {
		const { credentials } = makeCredentials([]);
		expect(credentials.key).toBe("credentials");
		expect(credentials.providerName).toBe("1password");
	});

	it("tries another spelling when op cannot find the name, and stops at the first that works", async () => {
		const { credentials, calls } = makeCredentials([NOT_FOUND, { status: 0, stdout: "T=1" }]);
		expect(await credentials.read("holocron")).toEqual({ T: "1" });
		expect(calls.map((c) => c.args[3])).toEqual(["holocron", "Holocron"]);
	});

	it("names every spelling it tried when none is found", async () => {
		const { credentials, calls } = makeCredentials([NOT_FOUND, NOT_FOUND, NOT_FOUND]);
		const err = await credentials.read("holocron").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as Error).message).toContain('"holocron", "Holocron", "HOLOCRON"');
		expect(calls).toHaveLength(3);
	});

	it("does not try other spellings after a failure that is not a missing name", async () => {
		const { credentials, calls } = makeCredentials([{ status: 1, stderr: "not signed in" }]);
		await expect(credentials.read("holocron")).rejects.toThrow(/not signed in/);
		expect(calls).toHaveLength(1);
	});

	it("reports a failure with no stderr", async () => {
		const { credentials } = makeCredentials([{ status: 1 }]);
		await expect(credentials.read("Holocron")).rejects.toThrow(/no stderr/);
	});

	it("gives op a time limit, so a prompt nobody answers cannot hang the command", async () => {
		const spawn = vi.fn(() => ({ status: 0, stdout: "A=1", stderr: "" })) as never;
		await new OpCredentials(new OpShell({ spawn })).read("Holocron");
		expect(spawn).toHaveBeenCalledWith(
			"op",
			expect.any(Array),
			expect.objectContaining({ timeout: READ_TIMEOUT_MS })
		);
	});

	it("passes --account when the shell has one", async () => {
		const { spawn, calls } = stubSpawn([{ status: 0, stdout: "A=1" }]);
		await new OpCredentials(new OpShell({ spawn, account: "ACCT" })).read("Holocron");
		expect(calls[0]?.args.slice(0, 2)).toEqual(["--account", "ACCT"]);
	});
});

describe("OpCredentials.inspect", () => {
	const CONCEALED = "HOLOCRON_ORG_TOKEN=<concealed by 1Password>\nexport B=<concealed by 1Password>\n# a note\n";

	it("lists the variable names without --reveal and without reading a value", async () => {
		const { credentials, calls } = makeCredentials([{ status: 0, stdout: CONCEALED }]);
		expect(await credentials.inspect("Holocron")).toEqual({
			environment: "Holocron",
			names: ["HOLOCRON_ORG_TOKEN", "B"],
		});
		expect(calls[0]?.args).toEqual(["environment", "secret", "list", "Holocron", "--format=dotenv"]);
	});

	it("says which spelling matched", async () => {
		const { credentials } = makeCredentials([NOT_FOUND, { status: 0, stdout: "T=<concealed by 1Password>" }]);
		expect(await credentials.inspect("holocron")).toEqual({ environment: "Holocron", names: ["T"] });
	});

	it("has no names for an empty environment", async () => {
		const { credentials } = makeCredentials([{ status: 0, stdout: "" }]);
		expect((await credentials.inspect("Holocron")).names).toEqual([]);
	});

	it("names every spelling it tried when none is found", async () => {
		const { credentials } = makeCredentials([NOT_FOUND, NOT_FOUND, NOT_FOUND]);
		await expect(credentials.inspect("holocron")).rejects.toThrow('"holocron", "Holocron", "HOLOCRON"');
	});
});
