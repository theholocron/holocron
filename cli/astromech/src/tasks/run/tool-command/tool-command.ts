import type { TaskDef } from "../../../registry/index.js";
import { LINTERS } from "../linters/index.js";

/** A binary and its arguments as one command, each argument quoted if it needs to be. */
function command(bin: string, args: readonly string[] = []): string {
	return [bin, ...args].map(shellWord).join(" ");
}

/** An argument as a shell word: quoted when it holds a glob character, a quote or a space. */
function shellWord(arg: string): string {
	return /[\s*?"']/.test(arg) ? JSON.stringify(arg) : arg;
}

/**
 * The command that does what a task's registry entry does, written as a `package.json` script: `knip`,
 * `prettier --write .`, `markdownlint-cli2 "**` + `/*.md"`. A linter group is each of its linters that has a local
 * binary, joined with `&&`. `null` for a task with no such command: CI-only, a holocron subcommand, a set of sub-jobs
 * or a tool picked by what the repo contains. It is what a root script holds for a repo-scoped leaf, and what the
 * runner recognizes as that generated script, which it must not prefer to its own run (a missing tool is a note
 * there, not a failure).
 */
export function toolCommand(def: TaskDef): string | null {
	const { local, linterGroup } = def;
	if (def.jobs || local?.command || local?.detect) return null;
	if (local?.tool) return command(local.tool, local.args);
	const commands = (linterGroup ?? []).flatMap((name) => {
		const linter = LINTERS[name];
		return linter?.localBin ? [command(linter.localBin, linter.localArgs)] : [];
	});
	return commands.length > 0 ? commands.join(" && ") : null;
}
