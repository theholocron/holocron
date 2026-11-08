import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEnvLookup } from "@theholocron/env-utils/lookup";

import type { CliRun, CliRunnerOptions, RunCliOptions } from "./cli-runner.type.js";

/**
 * How long one run may take by default. A start of the built CLI takes about a second idle and 15 s or more on a
 * machine running every package's tests at once, so the budget is well over that and under the preset's test timeout
 * (`@theholocron/vitest-config`, 120 s), which keeps this runner, the one that can say what happened, the first to give up.
 */
const DEFAULT_TIMEOUT_MS = 60_000;

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
						PATH: createEnvLookup().get("PATH") ?? "",
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
				const timeoutMs = run.timeoutMs ?? DEFAULT_TIMEOUT_MS;
				const started = Date.now();
				let timedOut = false;
				const timer = setTimeout(() => {
					timedOut = true;
					child.kill("SIGKILL");
				}, timeoutMs);
				child.on("error", reject);
				child.on("close", (code, signal) => {
					clearTimeout(timer);
					const elapsedMs = Date.now() - started;
					// A kill leaves only `code: -1` and whatever was printed, which for a child that never wrote anything is
					// nothing to go on, so say what happened.
					if (timedOut) {
						const note = `[cli-runner] killed after ${elapsedMs} ms (timeout ${timeoutMs} ms, ${signal}), pid ${child.pid}; stdout ${stdout.length} chars, stderr ${stderr.length} chars before this line; args: [${args.join(" ")}]`;
						stderr += `\n${note}`;
						// An assertion on `code` alone would hide the note, so the test log gets it too.
						console.error(note);
					}
					// A signal that was not ours (the system killing it for memory, a security tool) also leaves only `-1`.
					if (!timedOut && signal) {
						const note = `[cli-runner] ended by ${signal} after ${elapsedMs} ms, not by its timeout (${timeoutMs} ms), pid ${child.pid}; args: [${args.join(" ")}]`;
						stderr += `\n${note}`;
						console.error(note);
					}
					resolve({ stdout, stderr, code: code ?? -1, timedOut, elapsedMs });
				});
			});
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	};
}
