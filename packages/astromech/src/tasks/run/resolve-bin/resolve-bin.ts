import { join } from "node:path";

/** `<cwd>/node_modules/.bin/<tool>` when it exists, else the bare `tool` name (left to `PATH`). */
export function resolveBin(cwd: string, tool: string, fileExists: (p: string) => boolean): string {
	const local = join(cwd, "node_modules", ".bin", tool);
	return fileExists(local) ? local : tool;
}
