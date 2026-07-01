import type { SpawnSyncReturns } from "node:child_process";
import { vi, type Mock } from "vitest";

export interface SpawnCall {
	binary: string;
	args: string[];
}

export interface SpawnStub {
	spawn: typeof import("node:child_process").spawnSync;
	calls: SpawnCall[];
	mock: Mock;
}

/**
 * Stubbed `spawnSync` that returns the given responses in order.
 * Mirrors the `stubFetch` shape from the REST plugins so test bodies
 * look similar regardless of transport.
 *
 * Each response is either:
 *   - `{ status: 0, stdout: '...' }` — success
 *   - `{ status: 1, stderr: '...' }` — non-zero exit
 *   - `{ error: new Error('ENOENT') }` — spawn-level failure (binary missing)
 */
export function stubSpawn(
	responses: Array<{ status?: number; stdout?: string; stderr?: string; error?: Error }>
): SpawnStub {
	const calls: SpawnCall[] = [];
	let i = 0;
	const mock = vi.fn((binary: string, args: readonly string[]): SpawnSyncReturns<string> => {
		calls.push({ binary, args: [...args] });
		const next = responses[i++] ?? { status: 0, stdout: "", stderr: "" };
		return {
			pid: 0,
			output: [null, next.stdout ?? "", next.stderr ?? ""],
			stdout: next.stdout ?? "",
			stderr: next.stderr ?? "",
			status: next.status ?? 0,
			signal: null,
			...(next.error ? { error: next.error } : {}),
		} as SpawnSyncReturns<string>;
	});
	return {
		spawn: mock as unknown as typeof import("node:child_process").spawnSync,
		calls,
		mock,
	};
}
