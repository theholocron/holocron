import { describe, expect, it } from "vitest";

import { runCommand } from "./run-command.js";

const node = process.execPath;
const base = { program: node, cwd: process.cwd(), env: { HOLOCRON_IDEAS_DIR: "/vault" } };

describe("runCommand", () => {
	it("collects stdout and stderr with exit code 0", async () => {
		const result = await runCommand({
			...base,
			args: ["-e", "console.log(process.env.HOLOCRON_IDEAS_DIR); console.error('warn')"],
		});
		expect(result).toEqual({ code: 0, output: "/vault\nwarn\n" });
	});

	it("returns a non-zero exit code with the output", async () => {
		const result = await runCommand({ ...base, args: ["-e", "console.log('bad'); process.exit(3)"] });
		expect(result).toEqual({ code: 3, output: "bad\n" });
	});

	it("returns an error when the program cannot start", async () => {
		const result = await runCommand({ ...base, program: "definitely-not-a-program-xyz", args: [] });
		expect(result.code).toBeNull();
		expect(result.error).toContain("ENOENT");
	});

	it("stops a command that runs too long", async () => {
		const result = await runCommand({ ...base, args: ["-e", "setTimeout(() => {}, 5000)"] }, 100);
		expect(result.code).toBeNull();
		expect(result.error).toBe("It was stopped after 0.1 seconds.");
	});
});
