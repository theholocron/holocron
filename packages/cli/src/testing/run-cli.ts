import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CLI_BIN } from "./build-cli.js";

export interface CliRun {
	stdout: string;
	stderr: string;
	/** The exit code; -1 if the process was killed by the timeout. */
	code: number;
}

export interface RunCliOptions {
	/** Written as `holocron.config.json` in the working directory. A string is written as it is (for a broken file). */
	config?: object | string;
	/** Added to the controlled environment. */
	env?: Record<string, string>;
	timeoutMs?: number;
}

/**
 * Runs the built CLI (`dist/cli.mjs`) in a fresh temporary directory with a controlled environment, and returns what it
 * printed and how it exited. The environment is built from nothing: no tokens, no telemetry and no update check leak in
 * from whoever runs the tests, and stdin is closed, so a command that wants a terminal behaves as it does in CI.
 */
export async function runCli(args: string[], options: RunCliOptions = {}): Promise<CliRun> {
	const dir = await mkdtemp(join(tmpdir(), "holocron-cli-"));
	try {
		if (options.config !== undefined) {
			const body = typeof options.config === "string" ? options.config : JSON.stringify(options.config);
			await writeFile(join(dir, "holocron.config.json"), body);
		}
		return await new Promise<CliRun>((resolve, reject) => {
			const child = spawn(process.execPath, [CLI_BIN, ...args], {
				cwd: dir,
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					PATH: process.env["PATH"] ?? "",
					HOME: dir,
					TMPDIR: dir,
					FORCE_COLOR: "0",
					NO_COLOR: "1",
					NO_UPDATE_NOTIFIER: "1",
					HOLOCRON_TELEMETRY: "false",
					...options.env,
				},
			});
			let stdout = "";
			let stderr = "";
			child.stdout.on("data", (d: Buffer) => (stdout += d));
			child.stderr.on("data", (d: Buffer) => (stderr += d));
			const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 20_000);
			child.on("error", reject);
			child.on("close", (code) => {
				clearTimeout(timer);
				resolve({ stdout, stderr, code: code ?? -1 });
			});
		});
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
