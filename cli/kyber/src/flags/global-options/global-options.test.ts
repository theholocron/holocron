import { describe, expect, it } from "vitest";
import yargs from "yargs";

import { addGlobalOptions } from "./global-options.js";

const parse = (args: string[], options?: Parameters<typeof addGlobalOptions>[1]) =>
	addGlobalOptions(yargs(args), options).parseAsync();

describe("addGlobalOptions", () => {
	it("declares --dry-run (off), --token (none) and --cwd (the working directory) with their defaults", async () => {
		const argv = await parse([]);
		expect(argv["dryRun"]).toBe(false);
		expect(argv["token"]).toBeUndefined();
		expect(argv["cwd"]).toBe(process.cwd());
	});

	it("reads --dry-run, a repeatable --token and --cwd", async () => {
		const argv = await parse(["--dry-run", "--token", "abc", "--token", "github=ghp_1", "--cwd", "/work"]);
		expect(argv["dryRun"]).toBe(true);
		expect(argv["token"]).toEqual(["abc", "github=ghp_1"]);
		expect(argv["cwd"]).toBe("/work");
	});

	it("uses the cwd it is given as the default", async () => {
		expect((await parse([], { cwd: "/repo" }))["cwd"]).toBe("/repo");
	});

	it("describes the options in general terms unless told otherwise", async () => {
		const help = await addGlobalOptions(yargs([])).getHelp();
		expect(help).toContain("--dry-run");
		expect(help).toContain("--token");
		expect(help).toContain("--cwd");
		expect(help).toContain("The directory to work from");
	});

	it("takes the tool's own help text for each option", async () => {
		const help = await addGlobalOptions(yargs([]), {
			describe: { dryRun: "Show the plan only", token: "A vendor token", cwd: "Where the config is" },
		}).getHelp();
		expect(help).toContain("Show the plan only");
		expect(help).toContain("A vendor token");
		expect(help).toContain("Where the config is");
	});
});
