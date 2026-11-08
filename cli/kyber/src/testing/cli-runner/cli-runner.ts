import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";

import { createEnvLookup } from "@theholocron/env-utils/lookup";

import type { CliRun, CliRunnerOptions, RunCliOptions } from "./cli-runner.type.js";

// Run by node before the tool's own code: one byte on the extra pipe (fd 3) says the process is up, so the runner can tell a
// launch the machine is slow to start from a tool that hangs. It fails quietly when the pipe is not there.
const ALIVE_PRELOAD = 'try { require("node:fs").writeSync(3, "1"); } catch {}\n';

/**
 * How long one run may take by default, from the moment node runs its first line of JavaScript. A run of the built CLI
 * takes about a second idle and 15 s or more on a machine running every package's tests at once, so the budget is well
 * over that and, with {@link DEFAULT_START_TIMEOUT_MS}, under the preset's test timeout (`@theholocron/vitest-config`,
 * 120 s), which keeps this runner, the one that can say what happened, the first to give up.
 */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * How long node may take to start by default. Launching `node` was held for up to a minute on a loaded machine (#1902).
 * This and {@link DEFAULT_TIMEOUT_MS} add up to 110 s, under the preset's 120 s test timeout.
 */
const DEFAULT_START_TIMEOUT_MS = 50_000;

/**
 * A function that runs a tool's built binary in a fresh temporary directory with a controlled environment, and returns
 * what it printed and how it exited. The environment is built from nothing: no tokens, no telemetry and no update check
 * leak in from whoever runs the tests, and stdin is closed, so a command that wants a terminal behaves as it does in CI.
 *
 * Two clocks bound a run. `startTimeoutMs` bounds the wait until node runs its first line of JavaScript, and `timeoutMs`
 * bounds the run from there on, so a machine that is slow to launch processes (an endpoint-security agent under load can
 * hold a launch for tens of seconds, #1902) is not mistaken for a tool that hangs, and a tool that does hang is still
 * killed after `timeoutMs`.
 */
export function createCliRunner(options: CliRunnerOptions): (args: string[], run?: RunCliOptions) => Promise<CliRun> {
	return async (args, run = {}) => {
		const dir = await mkdtemp(join(tmpdir(), options.prefix ?? "cli-"));
		// Beside the working directory, not in it, so a test that lists the directory does not see the preload.
		const aliveDir = await mkdtemp(join(tmpdir(), "cli-alive-"));
		try {
			if (run.config !== undefined) {
				if (!options.configFile)
					throw new Error("this runner has no configFile, so a run cannot be given a config");
				const body = typeof run.config === "string" ? run.config : JSON.stringify(run.config);
				await writeFile(join(dir, options.configFile), body);
			}
			const alive = join(aliveDir, "alive.cjs");
			await writeFile(alive, ALIVE_PRELOAD);
			return await new Promise<CliRun>((resolve, reject) => {
				const child = spawn(process.execPath, ["--require", alive, options.bin, ...args], {
					cwd: dir,
					stdio: ["ignore", "pipe", "pipe", "pipe"],
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
				// stdout, stderr and the alive pipe; the stdio tuple above makes all three, but the types do not say so.
				const pipes = child.stdio as unknown as [null, Readable, Readable, Readable];
				let stdout = "";
				let stderr = "";
				pipes[1].on("data", (d: Buffer) => (stdout += d));
				pipes[2].on("data", (d: Buffer) => (stderr += d));
				const timeoutMs = run.timeoutMs ?? DEFAULT_TIMEOUT_MS;
				const startTimeoutMs = run.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
				const spawned = Date.now();
				let startMs = -1;
				let timedOut = false;
				let runTimer: NodeJS.Timeout | undefined;
				const kill = () => {
					timedOut = true;
					child.kill("SIGKILL");
				};
				const startTimer = setTimeout(kill, startTimeoutMs);
				pipes[3].once("data", () => {
					startMs = Date.now() - spawned;
					clearTimeout(startTimer);
					runTimer = setTimeout(kill, timeoutMs);
				});
				child.on("error", reject);
				child.on("close", (code, signal) => {
					clearTimeout(startTimer);
					clearTimeout(runTimer);
					const elapsedMs = Date.now() - spawned;
					// A kill leaves only `code: -1` and whatever was printed, which for a child that never wrote anything is
					// nothing to go on, so say what happened.
					if (timedOut) {
						const what =
							startMs < 0
								? `killed before node started, after ${elapsedMs} ms (start timeout ${startTimeoutMs} ms, ${signal})`
								: `killed after ${elapsedMs} ms (timeout ${timeoutMs} ms, ${signal}; node started after ${startMs} ms)`;
						const note = `[cli-runner] ${what}, pid ${child.pid}; stdout ${stdout.length} chars, stderr ${stderr.length} chars before this line; args: [${args.join(" ")}]`;
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
					resolve({ stdout, stderr, code: code ?? -1, timedOut, elapsedMs, startMs });
				});
			});
		} finally {
			await rm(dir, { recursive: true, force: true });
			await rm(aliveDir, { recursive: true, force: true });
		}
	};
}
