import type { SpawnSyncReturns } from "node:child_process";

import { type Mock, vi } from "vitest";

import type { SpawnFn } from "../upload.type.js";

/** One recorded call of the stubbed `spawnSync`. */
export interface SpawnCall {
	binary: string;
	args: string[];
	input?: string;
	env?: Record<string, string | undefined>;
}

/** The stub: the function to inject, and what it was called with. */
export interface SpawnStub {
	spawn: SpawnFn;
	calls: SpawnCall[];
	mock: Mock;
}

/**
 * Stubbed `spawnSync` that answers with the given responses in order (then with a plain success), recording each call's
 * binary, args, `input` and `env`. A response is `{ status, stdout, stderr }` or `{ error }` for a spawn-level failure.
 */
export function stubSpawn(
	responses: Array<{ status?: number; stdout?: string; stderr?: string; error?: Error }> = []
): SpawnStub {
	const calls: SpawnCall[] = [];
	let i = 0;
	const mock = vi.fn(
		(
			binary: string,
			args: readonly string[],
			options?: { input?: string; env?: Record<string, string | undefined> }
		): SpawnSyncReturns<string> => {
			calls.push({
				binary,
				args: [...args],
				...(options?.input === undefined ? {} : { input: options.input }),
				...(options?.env === undefined ? {} : { env: options.env }),
			});
			const next = responses[i++] ?? {};
			return {
				pid: 0,
				output: [null, next.stdout ?? "", next.stderr ?? ""],
				stdout: next.stdout ?? "",
				stderr: next.stderr ?? "",
				status: next.status ?? 0,
				signal: null,
				...(next.error ? { error: next.error } : {}),
			};
		}
	);
	return { spawn: mock as unknown as SpawnFn, calls, mock };
}
