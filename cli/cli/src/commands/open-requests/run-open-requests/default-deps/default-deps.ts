import { execFile, spawn } from "node:child_process";
import {
	closeSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeSync,
} from "node:fs";
import { promisify } from "node:util";

import { createPrivateFile, isGitIgnored } from "@theholocron/kyber/secrets";

import type { OpenRequestsDeps, PathState } from "../run-open-requests.type.js";

const run = promisify(execFile);

/** What is at `path`, without following a symlink. */
function inspect(path: string): PathState {
	let stat;
	try {
		stat = lstatSync(path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return { kind: "none" };
		throw err;
	}
	if (stat.isSymbolicLink()) return { kind: "symlink", to: readlinkSync(path) };
	if (!stat.isFile()) return { kind: "other" };
	return { kind: "file", firstLine: readFileSync(path, "utf8").split("\n")[0] ?? "" };
}

/** Whether a process with this id is running. */
function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}

/** Makes the lock file holding `pid`, or says it is held by a process that still runs; a lock of a dead one is replaced. */
function takeLock(path: string, pid: number): boolean {
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const fd = openSync(path, "wx", 0o600);
			writeSync(fd, String(pid));
			closeSync(fd);
			return true;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
			const holder = Number.parseInt(readFileSync(path, "utf8"), 10);
			if (Number.isInteger(holder) && alive(holder)) return false;
			rmSync(path, { force: true });
		}
	}
	/* v8 ignore next -- only when another run takes the lock between the check and the retry */
	return false;
}

/** The real collaborators of `open requests`. */
export function defaultDeps(): OpenRequestsDeps {
	return {
		isIgnored: isGitIgnored,
		makeDir: (dir) => void mkdirSync(dir, { recursive: true, mode: 0o700 }),
		createPrivateFile: (path, text) => closeSync(createPrivateFile(path, text).fd),
		inspect,
		symlink: (to, link) => symlinkSync(to, link),
		remove: (path) => rmSync(path, { force: true }),
		takeLock,
		/* v8 ignore start -- the process list, the program and the signals are only real outside tests, which inject them */
		processes: async () => (await run("ps", ["-axo", "command"], { maxBuffer: 16 * 1024 * 1024 })).stdout,
		run: (launch) =>
			new Promise<number>((resolve, reject) => {
				const child = spawn(launch.command, launch.args, { stdio: "inherit" });
				const stop = () => child.kill("SIGTERM");
				process.once("SIGTERM", stop);
				child.once("error", (err) => {
					process.off("SIGTERM", stop);
					reject(err);
				});
				child.once("exit", (code) => {
					process.off("SIGTERM", stop);
					resolve(code ?? 0);
				});
			}),
		onTerminate: (handler) => {
			const events = ["SIGINT", "SIGTERM", "SIGHUP", "exit"] as const;
			for (const event of events) process.once(event, handler);
			return () => {
				for (const event of events) process.off(event, handler);
			};
		},
		pid: process.pid,
		platform: process.platform,
		/* v8 ignore stop */
	};
}
