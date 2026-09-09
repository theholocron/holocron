import { createHeader } from "../../../utils/create-header.js";
import prePushBody from "./pre-push";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/templates/configs/pre-push/create-config.ts",
});

/**
 * `.husky/pre-push` — runs `holocron ci` (the merge-gating checks, in CI order)
 * before every push. Installed by `holocron setup` when hooks are enabled
 * (default for `protection: "strict"`). `git push --no-verify` bypasses it.
 *
 * @param holocronScript - the command that invokes the CLI. Defaults to
 *   `pnpm exec holocron`; the source repo passes `node packages/cli/dist/cli.mjs`.
 */
export function createConfig(holocronScript = "pnpm exec holocron"): string {
	return `${workflowHeader("shebang")}${prePushBody.replace("__HOLOCRON_SCRIPT__", holocronScript)}`;
}
