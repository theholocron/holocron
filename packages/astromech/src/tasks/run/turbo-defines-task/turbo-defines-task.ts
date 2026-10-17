import { join } from "node:path";

/** `true` when `<cwd>/turbo.json` declares `task` (under `tasks`, or turbo 1.x's `pipeline`). */
export function turboDefinesTask(
	cwd: string,
	task: string,
	readFile: (p: string) => string,
	fileExists: (p: string) => boolean
): boolean {
	if (!fileExists(join(cwd, "turbo.json"))) return false;
	try {
		const turbo = JSON.parse(readFile(join(cwd, "turbo.json"))) as {
			tasks?: Record<string, unknown>;
			pipeline?: Record<string, unknown>;
		};
		return Boolean(turbo.tasks?.[task] ?? turbo.pipeline?.[task]);
	} catch {
		return false;
	}
}
