import { describe, expect, it } from "vitest";

import { runCli } from "./testing/run-cli.js";

/** These run the built CLI, so what `cli.ts` does at the top level (the error paths, the exit codes) is checked as a user sees it. */
const demo = { name: "demo", providers: {} };

// Each case starts a process, and the whole suite runs beside them: allow far more than the 5 s default.
describe.concurrent("holocron (the built CLI)", { timeout: 30_000 }, () => {
	describe("errors", () => {
		it("prints a plain Error's message and exits 1, with no usage and no stack trace (#1103)", async () => {
			const run = await runCli(["config", "show"], { config: "{ nope" });
			expect(run.code).toBe(1);
			expect(run.stderr).toContain("is not valid JSON");
			expect(run.stderr).not.toMatch(/\n\s+at /);
			expect(run.stdout).toBe("");
		});

		it("prints a user-facing error as its whole story, without usage", async () => {
			const run = await runCli(["doctor"]);
			expect(run.code).toBe(1);
			expect(run.stderr).toMatch(/no holocron\.config\.\{ts,js,mjs,cjs,json\} found/);
			expect(run.stderr).not.toContain("Options:");
		});

		it("says a plugin that does not resolve cannot be used here", async () => {
			const run = await runCli(["doctor"], { config: { ...demo, providers: { source: "nosuchprovider" } } });
			expect(run.code).toBe(1);
			expect(run.stderr).toContain("holocron-plugin-nosuchprovider");
		});

		it("keeps yargs' own message for an unknown command or option", async () => {
			const unknown = await runCli(["frobnicate"], { config: demo });
			expect(unknown.code).toBe(1);
			expect(unknown.stderr).toContain("Unknown argument: frobnicate");
			const option = await runCli(["config", "show", "--nope"], { config: demo });
			expect(option.code).toBe(1);
			expect(option.stderr).toContain("Unknown argument: nope");
		});

		it("refuses to open a menu without a terminal, and says how to see the commands", async () => {
			const run = await runCli([], { config: demo });
			expect(run.code).toBe(1);
			expect(run.stderr).toContain("holocron --help");
		});
	});

	describe("output", () => {
		it("shows the resolved config as JSON", async () => {
			const run = await runCli(["config", "show"], { config: demo });
			expect(run.code).toBe(0);
			expect(JSON.parse(run.stdout)).toMatchObject({ name: "demo", providers: {} });
		});

		it("lists the commands for --help, and prints a version for --version", async () => {
			const help = await runCli(["--help"]);
			expect(help.code).toBe(0);
			expect(help.stdout).toMatch(/probe/);
			expect(help.stdout).toMatch(/doctor/);
			const version = await runCli(["--version"]);
			expect(version.code).toBe(0);
			expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
		});
	});

	describe("probe", () => {
		it("lists every group and probe without a terminal", async () => {
			const run = await runCli(["probe"], { config: demo });
			expect(run.code).toBe(0);
			expect(run.stdout).toMatch(/^core\n\s+providers/m);
			expect(run.stdout).toMatch(/comlink\n\s+bindings/);
		});

		it("lists one provider's probes, and says what is available for an unknown one", async () => {
			const one = await runCli(["probe", "core"], { config: demo });
			expect(one.code).toBe(0);
			expect(one.stdout).toContain("providers");
			const unknown = await runCli(["probe", "nope"], { config: demo });
			expect(unknown.code).toBe(1);
			expect(unknown.stdout).toMatch(/no probes for `nope`\s+try: comlink, core/);
		});

		it("runs a read-only probe and exits 0, listing the built-in group", async () => {
			const run = await runCli(["probe", "core", "providers"], { config: demo });
			expect(run.code).toBe(0);
			expect(run.stdout).toContain("Providers");
			expect(run.stdout).toMatch(/✓ comlink \(built in\)/);
		});

		it("exits 1 when a provider in the config cannot load, and says why", async () => {
			const run = await runCli(["probe", "core", "providers"], {
				config: { ...demo, providers: { source: "nosuchprovider" } },
			});
			expect(run.code).toBe(1);
			expect(run.stdout).toMatch(/✗ nosuchprovider\s+did not load/);
		});

		it("will not run a probe that changes things without --yes when there is no terminal", async () => {
			const run = await runCli(["probe", "comlink", "deliver"], { config: demo });
			expect(run.code).toBe(1);
			expect(run.stderr).toMatch(/changes things on comlink/);
			expect(run.stderr).toContain("--yes");
		});
	});
});
