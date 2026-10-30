import { createHeader } from "@theholocron/astromech";

// `holocron repo setup` and `holocron repo sync` both write the thin-caller workflows, from the same templates
// (astromech.thinCallers()). The header's `Tool:` line is one fixed value so the two commands produce the same
// bytes: the workflow-sync automation (platform.repoSync) runs `repo sync`, so that is what every consumer
// repo's committed workflows already say, and naming it here means a run of either command leaves them as they are.
const { workflowHeader } = createHeader({
	source: "cli/astromech/src/thin-callers.ts",
	tool: "holocron repo sync",
});

/**
 * The text of a generated thin-caller workflow: the AUTO-GENERATED header, the `# Source package:` marker (see
 * `resolvePkgRelPath`) and the workflow itself. Both `repo setup` and `repo sync` write their workflows through
 * this, so the file is the same whichever command wrote it.
 */
export function thinCallerFile(pkgRelPath: string, content: string): string {
	return `${workflowHeader()}# Source package: ${pkgRelPath}\n\n${content}`;
}
