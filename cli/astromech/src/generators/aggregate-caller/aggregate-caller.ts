import type { AggregateChecks } from "../aggregate-checks/index.js";
import { reusableWorkflowRef } from "../ci-ref/index.js";
import { yamlScalar } from "../github-action-thin-callers/grouped-publish/yaml-scalar.js";

/**
 * The thin caller of the `ci` aggregate: a `pull_request` workflow with one job, `ci`, that calls the reusable `ci.yml`
 * with the ids to wait on. The job runs from the PR's own workflow file, so a PR that changes the ids is judged by them.
 * It holds the permissions the reusable needs and nothing else; the reusable reads the Checks and status APIs only.
 */
export function aggregateCaller({ expected, statuses }: AggregateChecks): string {
	return [
		`name: CI`,
		``,
		`on: # yamllint disable-line rule:truthy`,
		`  pull_request:`,
		``,
		`concurrency:`,
		`  group: ci-\${{ github.ref }}`,
		`  cancel-in-progress: true`,
		``,
		`permissions:`,
		`  checks: read`,
		`  statuses: read`,
		`  contents: read`,
		``,
		`jobs:`,
		`  ci:`,
		`    name: ci`,
		`    uses: ${reusableWorkflowRef("ci.yml")}`,
		`    with:`,
		`      expected: ${yamlScalar(JSON.stringify(expected))}`,
		`      statuses: ${yamlScalar(JSON.stringify(statuses))}`,
		``,
	].join("\n");
}
