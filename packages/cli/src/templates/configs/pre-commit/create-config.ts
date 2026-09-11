import { createHeader } from "../../../utils/create-header.js";
import preCommitBody from "./pre-commit";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/templates/configs/pre-commit/create-config.ts",
});

/**
 * `.husky/pre-commit` — runs GitLeaks (scoped to staged changes) and
 * lint-staged before every commit. Installed by `holocron setup` when hooks
 * are enabled (default for `protection: "strict"`). `git commit --no-verify`
 * bypasses it.
 *
 * `gitleaks protect --staged` (not `gitleaks git`) is deliberate: the latter
 * scans the entire commit history on every invocation, so once any false
 * positive lands in a past commit — a fake test token, an example key in a
 * doc — every future commit is permanently blocked, regardless of what's
 * actually staged.
 */
export function createConfig(): string {
	return `${workflowHeader("shebang")}${preCommitBody}`;
}
