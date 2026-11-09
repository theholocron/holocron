/**
 * Calls a provider's optional `onProgress` hook with how many items are done of how many. A hook that throws is
 * ignored, because a progress counter must never change or stop the read or write it reports on.
 *
 * @param onProgress - The hook from `ExportInfo` or `ImportOptions`; nothing happens when it is not given.
 * @param done - How many items are finished.
 * @param total - How many items there are.
 */
export function reportProgress(
	onProgress: ((done: number, total: number) => void) | undefined,
	done: number,
	total: number
): void {
	try {
		onProgress?.(done, total);
	} catch {
		// A broken counter is not a reason to stop a migration.
	}
}
