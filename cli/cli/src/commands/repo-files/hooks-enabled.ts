import type { RepoFilesInput } from "./repo-files.type.js";

/** Whether git hooks are installed: `--hooks` / `--no-hooks` wins, then `config.hooks`, then on for `protection: "strict"`. */
export function hooksEnabled(input: Pick<RepoFilesInput, "loaded" | "hooks">): boolean {
	const config = input.loaded.resolved;
	if (input.hooks !== undefined) return input.hooks;
	if (typeof config.hooks === "boolean") return config.hooks;
	if (typeof config.hooks === "object") return config.hooks.prePush !== false;
	return config.repo?.protection === "strict";
}
