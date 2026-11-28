/**
 * How a runnable task reaches a script in a repo with a `turbo.json`:
 *
 * - `turbo`: fans out over the packages (`turbo run <key>`), each running its own script of that name;
 * - `tool`: a repo-scoped leaf whose root script holds the registry's own command, run once at the root;
 * - `cli`: runnable only through `holocron run` (a holocron subcommand, a set of sub-jobs, a tool picked by what the
 *   repo contains, a linter group with no local binary), so a turbo repo has no script for it.
 */
export type PlannedKind = "turbo" | "tool" | "cli";

/** One flat task id a manifest entry stands for and the repo can run locally. */
export interface PlannedTask {
	/** The manifest entry that listed it (`verification.unitTests`, or `test:unit` itself). */
	entry: string;
	/** The flat id. */
	id: string;
	/** The root script's name: the id in its script spelling (`deploy-preview` is `deploy:preview`). */
	script: string;
	/** The key in `turbo.json` and the package scripts: follows the entry's spelling (see `taskKey`). */
	key: string;
	/** How the task reaches a script: through turbo, a root tool script, or only the CLI. */
	kind: PlannedKind;
	/** The root script's body for a `tool` leaf. */
	command?: string;
}
