import { posix } from "node:path";

/**
 * The folder a report's source paths start from, relative to the repo root: the report's folder less a trailing
 * `coverage`, or `""` for a report at the repo root (in `.`, or in a `coverage` folder there).
 */
export function reportPackageDir(reportPath: string): string {
	let dir = posix.dirname(reportPath);
	if (dir.endsWith("/coverage")) dir = dir.slice(0, -"/coverage".length);
	return dir === "." || dir === "coverage" ? "" : dir;
}

/**
 * A copy of an lcov report whose paths start at the repo root, so Codecov can place them. A package's report names its
 * files from the package (`SF:src/index.ts`), and `src/index.ts` exists in dozens of packages; the copy names
 * `SF:clients/doppler-client/src/index.ts`. Only relative `SF:` lines change (an absolute path is left alone), and a
 * report at the repo root is returned as it is.
 */
export function rootReport(content: string, reportPath: string): string {
	const dir = reportPackageDir(reportPath);
	if (dir === "") return content;
	const lines = content.split("\n");
	if (lines[lines.length - 1] === "") lines.pop();
	return (
		lines
			.map((line) => (line.startsWith("SF:") && line[3] !== "/" ? `SF:${dir}/${line.slice(3)}` : line))
			.join("\n") + (lines.length > 0 ? "\n" : "")
	);
}
