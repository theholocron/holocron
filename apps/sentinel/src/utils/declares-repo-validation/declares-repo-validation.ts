import { SENTINEL_REPO_VALIDATION_TASK } from "../constants/index.js";

/**
 * The task names under which a repo's config asks for the repo-validation checks (`Validate ADRs and specs`, `Validate
 * docs`): the old `platform.repoValidation`, the `validate` alias for both leaves, and either leaf by its flat id. A repo
 * written with the flat ids (this one) was never matched by the old name alone, so Sentinel posted neither check for it.
 */
const REPO_VALIDATION_TASKS: readonly string[] = [
	SENTINEL_REPO_VALIDATION_TASK,
	"validate",
	"validate:specs",
	"validate:docs",
];

/** Whether any of the config's task names asks for the repo-validation checks; both are posted together. */
export function declaresRepoValidation(taskNames: readonly string[]): boolean {
	return taskNames.some((name) => REPO_VALIDATION_TASKS.includes(name));
}
