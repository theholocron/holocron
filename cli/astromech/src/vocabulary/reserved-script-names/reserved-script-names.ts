/**
 * Script names npm and pnpm give a meaning of their own, so no task may be named like one (spec
 * `ci-flat-task-vocabulary`, "npm lifecycle and package-manager names"): `pnpm publish` runs a script called `publish`
 * after publishing, `prepare` and the install hooks run on `pnpm install`, `version` hooks wrap `npm version`. That is
 * why the task is `release`. `prepare` stays a root script (husky) and can never be a task.
 */
export const RESERVED_SCRIPT_NAMES: ReadonlySet<string> = new Set([
	"publish",
	"prepublish",
	"prepublishOnly",
	"postpublish",
	"prepack",
	"postpack",
	"prepare",
	"preinstall",
	"install",
	"postinstall",
	"version",
	"preversion",
	"postversion",
]);

/**
 * pnpm's own commands. `pnpm deploy` runs pnpm's `deploy`, not the script, which is reachable only as `pnpm run deploy`,
 * so anything that prints a command for a script of this name must print `pnpm run <script>`.
 */
export const PNPM_BUILTIN_COMMANDS: ReadonlySet<string> = new Set([
	"deploy",
	"publish",
	"audit",
	"install",
	"add",
	"update",
	"link",
	"pack",
	"exec",
	"store",
	"doctor",
]);
