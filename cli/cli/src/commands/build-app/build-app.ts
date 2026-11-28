import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** What {@link buildApp} did: `built`, `none` when the package has no `build` script, or `fail` with the exit code. */
export type BuildAppResult = { status: "built" | "none" } | { status: "fail"; message: string };

/**
 * Runs the app's own `build` script (`pnpm run build`) in its folder, with output shown. An app with no `build` script
 * is not an error: there is nothing to build.
 *
 * @param dir - The app's absolute folder.
 */
export function buildApp(dir: string): BuildAppResult {
	const manifest = join(dir, "package.json");
	if (!existsSync(manifest)) return { status: "none" };
	const scripts = (JSON.parse(readFileSync(manifest, "utf8")) as { scripts?: Record<string, string> }).scripts;
	if (!scripts?.build) return { status: "none" };
	const run = spawnSync("pnpm", ["run", "build"], { cwd: dir, stdio: "inherit" });
	if (run.status === 0) return { status: "built" };
	return {
		status: "fail",
		message: `\`pnpm run build\` failed in ${dir}${run.error ? `: ${run.error.message}` : ` (exit ${run.status ?? "signal"})`}`,
	};
}
