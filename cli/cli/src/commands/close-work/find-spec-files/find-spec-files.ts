import { classifySpecPath } from "@theholocron/astromech/repo-validation";

/** The ADRs and specs among a pull request's changed paths, sorted; `sync specs --withdraw --files` takes them. */
export function findSpecFiles(files: readonly string[]): string[] {
	return [...new Set(files.filter((file) => classifySpecPath(file) !== undefined))].sort();
}
