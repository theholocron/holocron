import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The text of an issue from `--body-file`: a path (relative to `cwd`), or `-` for standard input. `read` is injected
 * so a test needs no file or terminal.
 */
export function readIssueBody(
	file: string,
	cwd: string,
	read: (path: string | number) => string = (p) => readFileSync(p, "utf8")
): string {
	return file === "-" ? read(0) : read(resolve(cwd, file));
}
