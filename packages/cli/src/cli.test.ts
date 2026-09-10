import { describe, expect, it } from "vitest";
import yargs from "yargs";

/**
 * `cli.ts` wires `holocron run <task> [job] -- <args>` so `<args>` reach the
 * underlying tool (`lhci autorun --config=…`, `turbo run build -- …`). The
 * `run` handler builds `passthrough` from `argv.passthrough` (bare positionals)
 * plus `argv["--"]` (everything after `--`). Without `populate--: true` the
 * `--config=…` token folds into `argv._` — dropped by the handler and leaked
 * into the telemetry command name.
 */
describe("run passthrough parsing", () => {
	const parse = (args: string[]) =>
		yargs(args)
			.parserConfiguration({ "populate--": true })
			.command("run <task> [job] [passthrough..]", "", (y) =>
				y
					.positional("task", { type: "string" })
					.positional("job", { type: "string" })
					.positional("passthrough", {
						type: "string",
						array: true,
					})
			)
			.parseSync();

	it("routes positionals to task/job and everything after `--` to argv['--']", () => {
		const argv = parse(["run", "audit", "performance", "--", "--config=lighthouse.config.cjs"]);
		expect(argv.task).toBe("audit");
		expect(argv.job).toBe("performance");
		expect(argv["--"]).toEqual(["--config=lighthouse.config.cjs"]);
		expect(argv.passthrough ?? []).toEqual([]);
	});

	it("keeps the `--config` token out of argv._ (telemetry command name stays 'run')", () => {
		const argv = parse(["run", "audit", "performance", "--", "--config=x"]);
		expect(argv._).toEqual(["run"]);
	});

	it("still captures a bare positional (`holocron run build src/`)", () => {
		const argv = parse(["run", "build", "src/"]);
		expect(argv.job).toBe("src/");
	});

	it("merges bare passthrough and `--` args the way the handler does", () => {
		const argv = parse(["run", "test", "extra", "--", "--watch"]);
		const passthrough = [
			...((argv.passthrough as string[] | undefined) ?? []),
			...((argv["--"] as string[] | undefined) ?? []),
		];
		// `extra` lands in `job` here (first optional positional); the real
		// registry folds an unknown job back into passthrough. `--watch` comes
		// through `argv["--"]`.
		expect(passthrough).toEqual(["--watch"]);
	});
});
