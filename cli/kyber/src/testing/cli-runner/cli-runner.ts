import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CliRun, CliRunnerOptions, RunCliOptions } from "./cli-runner.type.js";

/**
 * A function that runs a tool's built binary in a fresh temporary directory with a controlled environment, and returns
 * what it printed and how it exited. The environment is built from nothing: no tokens, no telemetry and no update check
 * leak in from whoever runs the tests, and stdin is closed, so a command that wants a terminal behaves as it does in CI.
 */
export function createCliRunner(options: CliRunnerOptions): (args: string[], run?: RunCliOptions) => Promise<CliRun> {
	return async (args, run = {}) => {
		const dir = await mkdtemp(join(tmpdir(), options.prefix ?? "cli-"));
		try {
			if (run.config !== undefined) {
				if (!options.configFile)
					throw new Error("this runner has no configFile, so a run cannot be given a config");
				const body = typeof run.config === "string" ? run.config : JSON.stringify(run.config);
				await writeFile(join(dir, options.configFile), body);
			}
			return await new Promise<CliRun>((resolve, reject) => {
				const child = spawn(process.execPath, [options.bin, ...args], {
					cwd: dir,
					stdio: ["ignore", "pipe", "pipe"],
					env: {
						PATH: process.env["PATH"] ?? "",
						HOME: dir,
						TMPDIR: dir,
						FORCE_COLOR: "0",
						NO_COLOR: "1",
						NO_UPDATE_NOTIFIER: "1",
						...options.env,
						...run.env,
					},
				});
				let stdout = "";
				let stderr = "";
				child.stdout.on("data", (d: Buffer) => (stdout += d));
				child.stderr.on("data", (d: Buffer) => (stderr += d));
				const timer = setTimeout(() => child.kill("SIGKILL"), run.timeoutMs ?? 20_000);
				child.on("error", reject);
				child.on("close", (code) => {
					clearTimeout(timer);
					resolve({ stdout, stderr, code: code ?? -1 });
				});
			});
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	};
}
