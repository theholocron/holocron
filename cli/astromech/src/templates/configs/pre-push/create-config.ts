import { createHeader } from "../../../utils/index.js";
import prePushBody from "./pre-push";

const { workflowHeader } = createHeader({
	source: "cli/astromech/src/templates/configs/pre-push/create-config.ts",
});

/**
 * `.husky/pre-push` — runs `holocron run ci` (the merge-gating checks, in CI order)
 * before every push. Installed by `holocron setup` when hooks are enabled
 * (default for `protection: "strict"`). `git push --no-verify` bypasses it.
 *
 * A script that runs a built file (`node cli/cli/dist/cli.mjs`) gets a check first: in a fresh clone or linked worktree
 * the build does not exist yet, and without it the push dies with a module-not-found stack trace instead of saying what
 * to do (#1104).
 *
 * @param holocronScript - the command that invokes the CLI. Defaults to
 *   `pnpm exec holocron`; the source repo passes `node cli/cli/dist/cli.mjs`.
 */
export function createConfig(holocronScript = "pnpm exec holocron"): string {
	const built = /^node (\S+)$/.exec(holocronScript)?.[1];
	const buildCheck = built
		? `if [ ! -f "${built}" ]; then
\techo "pre-push: ${built} is not built yet. Run: pnpm install && pnpm build (or push with --no-verify)." >&2
\texit 1
fi
`
		: "";
	return `${workflowHeader("shebang")}${prePushBody.replace("__BUILD_CHECK__\n", buildCheck).replace("__HOLOCRON_SCRIPT__", holocronScript)}`;
}
