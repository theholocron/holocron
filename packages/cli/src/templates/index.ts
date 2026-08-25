/**
 * All reusable workflow and composite action content bundled as string
 * constants so the CLI can push them to theholocron/.github without
 * needing filesystem access at runtime.
 *
 * Content lives in standalone .yml files; the rawYml rollup plugin
 * inlines them as string exports at build time.
 */

import installAction from "./actions/install.yml";
import setupAction from "./actions/setup.yml";
import setupNodeAction from "./actions/setup-node.yml";
import auditWorkflow from "./workflows/audit.yml";
import bookkeepingWorkflow from "./workflows/bookkeeping.yml";
import codeqlWorkflow from "./workflows/codeql.yml";
import dependenciesWorkflow from "./workflows/dependencies.yml";
import deployWorkflow from "./workflows/deploy.yml";
import greetingsWorkflow from "./workflows/greetings.yml";
import lintWorkflow from "./workflows/lint.yml";
import releaseWorkflow from "./workflows/release.yml";
import reviewWorkflow from "./workflows/review.yml";
import staleWorkflow from "./workflows/stale.yml";
import syncGithubWorkflow from "./workflows/sync-github.yml";
import syncWorkflow from "./workflows/sync.yml";
import testWorkflow from "./workflows/test.yml";
import typecheckWorkflow from "./workflows/typecheck.yml";

export const ACTIONS: Record<string, string> = {
	"setup/action": setupAction,
	"install/action": installAction,
	"setup-node/action": setupNodeAction,
};

export const REUSABLE_WORKFLOWS: Record<string, string> = {
	audit: auditWorkflow,
	bookkeeping: bookkeepingWorkflow,
	codeql: codeqlWorkflow,
	dependencies: dependenciesWorkflow,
	deploy: deployWorkflow,
	greetings: greetingsWorkflow,
	lint: lintWorkflow,
	release: releaseWorkflow,
	review: reviewWorkflow,
	stale: staleWorkflow,
	"sync-github": syncGithubWorkflow,
	sync: syncWorkflow,
	test: testWorkflow,
	typecheck: typecheckWorkflow,
};

export const WORKFLOW_TEMPLATE_PROPERTIES: Record<string, string> = {
	bookkeeping: JSON.stringify(
		{
			name: "Bookkeeping",
			description: "Label and track issues and pull requests.",
			iconName: "octicon tag",
		},
		null,
		2
	),
};
