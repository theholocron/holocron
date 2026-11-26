import type { RepoConfig } from "../../config/index.js";

/**
 * The status-check contexts the repo writes down in `repo.requiredChecks` (`.holocron/repo.ts`), de-duplicated and in the
 * order given, or `undefined` when it leaves the list out and `holocron setup` derives it from the task manifest
 * (`astromech.requiredChecks()`). A declared list is the whole list: nothing is added to it (not the DCO check, not a
 * task's context), so what the ruleset requires is what the file says. `setup` writes it and `doctor repo` compares it.
 */
export function declaredRequiredChecks(repo: Pick<RepoConfig, "requiredChecks"> | undefined): string[] | undefined {
	const declared = repo?.requiredChecks;
	return declared === undefined ? undefined : [...new Set(declared)];
}
