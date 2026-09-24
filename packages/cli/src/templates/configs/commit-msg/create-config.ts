import { createHeader } from "../../../utils/create-header.js";
import commitMsgBody from "./commit-msg";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/templates/configs/commit-msg/create-config.ts",
});

/**
 * `.husky/commit-msg` — lints the commit message via `holocron lint
 * commit-msg` (holocron#789), the real programmatic replacement for
 * shelling out to `commitlint --edit`. Installed by `holocron setup` when
 * hooks are enabled. Same `__HOLOCRON_SCRIPT__` substitution as `pre-push`.
 *
 * @param holocronScript - the command that invokes the CLI. Defaults to
 *   `pnpm exec holocron`; the source repo passes `node packages/cli/dist/cli.mjs`.
 */
export function createConfig(holocronScript = "pnpm exec holocron"): string {
	return `${workflowHeader("shebang")}${commitMsgBody.replace("__HOLOCRON_SCRIPT__", holocronScript)}`;
}
