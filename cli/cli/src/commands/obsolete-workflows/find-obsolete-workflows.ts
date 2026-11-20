import { isGenerated } from "../probe/tasks/index.js";
import { SOURCE_PACKAGE_MARKER } from "../workflow-source-marker/index.js";
import type { FindObsoleteWorkflowsInput } from "./obsolete-workflows.type.js";

/** The lines at the head of a generated workflow that hold the header and the `# Source package:` marker. */
const HEADER_LINES = 6;

/**
 * The workflow files in `.github/workflows` that an earlier `sync` generated and that this run no longer writes, because
 * their task left the config or a preset (#2338). Sorted by name.
 *
 * It names a file only when all of these hold, so a file nobody generated is never removed:
 * - the generator's own `AUTO-GENERATED` header is at its head;
 * - it is not marked `# HAND-MAINTAINED`;
 * - its `# Source package:` line is this run's package, so a run for `apps/sentinel` leaves the root's files alone, and a
 *   file with no marker (written before the marker existed) is left for `probe generated check` to report;
 * - this run does not write it.
 */
export function findObsoleteWorkflows({ workflows, written, pkgRelPath }: FindObsoleteWorkflowsInput): string[] {
	const obsolete: string[] = [];
	for (const [name, text] of workflows) {
		if (written.has(name) || text.startsWith("# HAND-MAINTAINED") || !isGenerated(text)) continue;
		const head = text.split("\n", HEADER_LINES).join("\n");
		if (SOURCE_PACKAGE_MARKER.exec(head)?.[1] !== pkgRelPath) continue;
		obsolete.push(name);
	}
	return obsolete.sort();
}
