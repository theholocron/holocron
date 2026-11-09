import type { RunResult, SyncCommand } from "../filing/filing.type.js";

/** How long `ideas sync` may run before it is stopped; it makes one request per note it files. */
export const RUN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Runs the command and collects its output. `child_process` is loaded here, on first use, and not at the top of the
 * file: the plugin also loads on iOS, where there is no Node, and a top-level import would stop it from loading at all.
 * Only desktop calls this.
 */
export function runCommand(command: SyncCommand, timeoutMs = RUN_TIMEOUT_MS): Promise<RunResult> {
	// `require`, not `import()`: the bundle is CommonJS and Obsidian's Electron renderer resolves `require` for builtins.
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- the lazy load is the point
	const { execFile } = require("child_process") as typeof import("node:child_process");
	return new Promise((resolve) => {
		execFile(
			command.program,
			command.args,
			{
				cwd: command.cwd,
				env: { ...process.env, ...command.env },
				timeout: timeoutMs,
				maxBuffer: 4 * 1024 * 1024,
			},
			(error, stdout, stderr) => {
				const output = `${stdout}${stderr}`;
				if (error === null) {
					resolve({ code: 0, output });
					return;
				}
				const code = typeof error.code === "number" ? error.code : null;
				const reason =
					error.killed === true ? `It was stopped after ${timeoutMs / 1000} seconds.` : error.message;
				resolve(code === null ? { code, output, error: reason } : { code, output });
			}
		);
	});
}
