import { type ChildProcess, spawn } from "node:child_process";

import type {
	SupervisedProcess,
	SuperviseProcessesInput,
	SuperviseProcessesResult,
} from "./supervise-processes.type.js";

/**
 * Runs two processes side by side in the foreground, with their output on the terminal,
 * and stops the other when either ends. Ctrl-C and a termination signal go to both and are not a failure. A process
 * that cannot be started stops the other and rejects, saying which program it was.
 */
export function superviseProcesses(input: SuperviseProcessesInput): Promise<SuperviseProcessesResult> {
	return new Promise((resolve, reject) => {
		const spawnImpl = input.spawn ?? spawn;
		const start = (p: SupervisedProcess): ChildProcess =>
			spawnImpl(p.command, p.args, { stdio: "inherit", env: { ...process.env, ...p.env } });
		const children = { primary: start(input.primary), companion: start(input.companion) };
		const names = ["primary", "companion"] as const;

		let endedFirst: "primary" | "companion" | undefined;
		let status = 0;
		let interrupted = false;
		let done = false;
		const ended = new Set<string>();

		const signals = (["SIGINT", "SIGTERM"] as const).map((signal) => {
			const handler = () => {
				interrupted = true;
				for (const child of Object.values(children)) child.kill(signal);
			};
			process.on(signal, handler);
			return [signal, handler] as const;
		});
		const cleanUp = () => {
			for (const [signal, handler] of signals) process.off(signal, handler);
		};
		const stopAll = () => {
			for (const child of Object.values(children)) child.kill("SIGTERM");
		};

		for (const name of names) {
			const other = name === "primary" ? "companion" : "primary";
			children[name].once("error", (err) => {
				if (done) return;
				done = true;
				cleanUp();
				stopAll();
				const program = input[name].command;
				reject(
					new Error(
						(err as NodeJS.ErrnoException).code === "ENOENT"
							? `${program} is not installed or not on the PATH`
							: `could not start ${program}: ${err.message}`
					)
				);
			});
			children[name].once("exit", (code) => {
				ended.add(name);
				if (endedFirst === undefined) {
					endedFirst = name;
					status = code ?? 1;
					children[other].kill("SIGTERM");
				}
				if (ended.size === names.length && !done) {
					done = true;
					cleanUp();
					resolve({ exitCode: interrupted ? 0 : status, endedFirst, interrupted });
				}
			});
		}
	});
}
