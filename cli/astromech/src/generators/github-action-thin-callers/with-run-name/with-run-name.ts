import { workflowTitle } from "../workflow-title/index.js";

/**
 * Add a `run-name:` after the `name:` line of a thin caller, so a run is titled for what it did (`Deploy Sentinel
 * (manual)`) and not with the task id. Only the events the caller has `triggers` for get a branch: a manual run says so,
 * a scheduled one says so, a pull request run and a push run keep what GitHub would have shown (the pull request title,
 * the commit message) after the title, and any other event is the title alone. The workflow `name:`, job names and so
 * check names are not touched.
 */
export function withRunName(yaml: string, id: string, triggers: readonly string[]): string {
	const title = workflowTitle(id);
	const branches: string[] = [];
	if (triggers.includes("workflow_dispatch")) {
		branches.push(`github.event_name == 'workflow_dispatch' && '${title} (manual)'`);
	}
	if (triggers.includes("schedule")) {
		branches.push(`github.event_name == 'schedule' && '${title} (scheduled)'`);
	}
	if (triggers.some((t) => t === "pull_request" || t === "pull_request_target")) {
		branches.push(
			`(github.event_name == 'pull_request' || github.event_name == 'pull_request_target') && format('${title}: {0}', github.event.pull_request.title)`
		);
	}
	if (triggers.includes("push")) {
		branches.push(`github.event_name == 'push' && format('${title}: {0}', github.event.head_commit.message)`);
	}
	const value = branches.length === 0 ? title : `"\${{ ${[...branches, `'${title}'`].join(" || ")} }}"`;
	return yaml.replace(/^(name: [^\n]*\n)/m, `$1\nrun-name: ${value}\n`);
}
