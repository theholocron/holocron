import { describe, expect, it } from "vitest";

import { withRunName } from "./with-run-name.js";

const yaml = "name: deploy-sentinel\n\non:\n  push:\n";

describe("withRunName", () => {
	it("puts the run-name after the name line and leaves the name alone", () => {
		const out = withRunName(yaml, "deploy-sentinel", ["push"]);
		expect(out.startsWith("name: deploy-sentinel\n\nrun-name: ")).toBe(true);
		expect(out.endsWith("\n\non:\n  push:\n")).toBe(true);
	});

	it("titles a push run with the commit message", () => {
		expect(withRunName(yaml, "deploy-sentinel", ["push"])).toContain(
			`run-name: "\${{ github.event_name == 'push' && format('Deploy Sentinel: {0}', github.event.head_commit.message) || 'Deploy Sentinel' }}"\n`
		);
	});

	it("titles a manual run and a scheduled run, and falls back to the title", () => {
		expect(withRunName(yaml, "check-tokens", ["schedule", "workflow_dispatch"])).toContain(
			`run-name: "\${{ github.event_name == 'workflow_dispatch' && 'Check Tokens (manual)' || github.event_name == 'schedule' && 'Check Tokens (scheduled)' || 'Check Tokens' }}"\n`
		);
	});

	it("titles a pull request run with the pull request title, for both pull request events", () => {
		expect(withRunName(yaml, "lint:code", ["pull_request_target"])).toContain(
			`run-name: "\${{ (github.event_name == 'pull_request' || github.event_name == 'pull_request_target') && format('Lint Code: {0}', github.event.pull_request.title) || 'Lint Code' }}"\n`
		);
	});

	it("is the title alone when no trigger has a branch", () => {
		expect(withRunName(yaml, "reconcile-ci", ["workflow_run"])).toContain("\nrun-name: Reconcile CI\n");
	});
});
