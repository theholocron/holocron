import { createHeader } from "../../../utils/index.js";
import prePushBody from "./pre-push";

const { workflowHeader } = createHeader({
	source: "cli/astromech/src/templates/configs/pre-push/create-config.ts",
});

/**
 * `.husky/pre-push` — runs `holocron run ci` (the merge-gating checks, in CI order)
 * before every push. Installed by `holocron repo setup` when hooks are enabled
 * (default for `protection: "strict"`). `git push --no-verify` bypasses it.
 *
 * @param holocronScript - the command that invokes the CLI. Defaults to
 *   `pnpm exec holocron`; the source repo passes `node cli/cli/dist/cli.mjs`.
 */
export function createConfig(holocronScript = "pnpm exec holocron"): string {
	return `${workflowHeader("shebang")}${prePushBody.replace("__HOLOCRON_SCRIPT__", holocronScript)}`;
}
