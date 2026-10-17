import type { Run } from "../../../utils/index.js";
import { WAIT_INTERVAL_MS, WAIT_TIMEOUT_MS } from "../constants.js";

/**
 * Waits until npm serves every `name@version` in `packages`, asking with
 * `npm view --prefer-online` (so npm's local cache can't answer for the
 * registry) every `intervalMs`, for up to `timeoutMs`.
 *
 * @returns The specs npm still doesn't serve; empty once all are available.
 */
export async function waitForPublished({
	packages,
	run,
	sleep,
	now,
	cwd,
	timeoutMs = WAIT_TIMEOUT_MS,
	intervalMs = WAIT_INTERVAL_MS,
}: {
	packages: { name: string; version: string }[];
	run: Run;
	sleep: (ms: number) => Promise<void>;
	now: () => number;
	cwd?: string;
	timeoutMs?: number;
	intervalMs?: number;
}): Promise<string[]> {
	const deadline = now() + timeoutMs;
	let pending = packages.map(({ name, version }) => `${name}@${version}`);
	for (;;) {
		pending = pending.filter((spec) => {
			const version = spec.slice(spec.lastIndexOf("@") + 1);
			const result = run("npm", ["view", spec, "version", "--prefer-online"], { cwd });
			return !(result.status === 0 && result.stdout.trim() === version);
		});
		if (pending.length === 0 || now() + intervalMs > deadline) return pending;
		await sleep(intervalMs);
	}
}
