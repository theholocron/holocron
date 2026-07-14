/**
 * Thin workflow wrapper templates for `holocron setup`.
 *
 * Each entry is a complete `.github/workflows/<name>.yml` that delegates
 * to the corresponding reusable `ci-<name>.yml` in `theholocron/.github`.
 * Files are overwritten on each setup run — they are generated artifacts.
 */

const WORKFLOW_REPO = "theholocron/.github";
const WORKFLOW_REF = "main";

function ref(name: string): string {
	return `${WORKFLOW_REPO}/.github/workflows/${name}.yml@${WORKFLOW_REF}`;
}

/** Header prepended when holocron setup writes a thin caller to a repo. */
export function workflowHeader(): string {
	return [
		`# AUTO-GENERATED — do not edit directly.`,
		`# Source:  theholocron/holocron · packages/cli/src/commands/setup-workflows.ts`,
		`# Synced:  ${new Date().toISOString()}`,
		`# Tool:    holocron setup`,
		`# Changes: run \`holocron setup\` to regenerate.`,
		``,
	].join("\n");
}

export const WORKFLOW_TEMPLATES: Record<string, string> = {
	lint: `\
name: Lint

on: # yamllint disable-line rule:truthy
  push:
    branches: [main, alpha]
  pull_request:

concurrency:
  group: lint-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: write
  statuses: write

jobs:
  lint:
    name: Lint
    uses: ${ref("lint")}
    secrets: inherit
    with:
      enable-auto-commit: true
`,

	test: `\
name: Test

on: # yamllint disable-line rule:truthy
  push:
    branches: [main, alpha]
  pull_request:

concurrency:
  group: test-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  test:
    name: Test
    uses: ${ref("test")}
    secrets: inherit
`,

	typecheck: `\
name: Typecheck

on: # yamllint disable-line rule:truthy
  push:
    branches: [main, alpha]
  pull_request:

concurrency:
  group: typecheck-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  typecheck:
    name: Typecheck
    uses: ${ref("typecheck")}
    secrets: inherit
`,

	codeql: `\
name: CodeQL

on: # yamllint disable-line rule:truthy
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  schedule:
    - cron: "0 0 * * 1"

permissions:
  actions: read
  contents: read
  security-events: write

jobs:
  codeql:
    uses: ${ref("codeql")}
    secrets: inherit
`,

	review: `\
name: Review

on: # yamllint disable-line rule:truthy
  pull_request:

concurrency:
  group: review-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  checks: write
  pull-requests: write

jobs:
  review:
    name: Review
    uses: ${ref("review")}
    secrets: inherit
`,

	release: `\
name: Release

on: # yamllint disable-line rule:truthy
  push:
    branches:
      - main
      - alpha
  workflow_dispatch:

permissions:
  contents: write
  id-token: write
  issues: write
  pull-requests: write

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: false

jobs:
  release:
    uses: ${ref("release")}
    secrets: inherit
`,

	stale: `\
name: Stale

on: # yamllint disable-line rule:truthy
  schedule:
    - cron: "30 1 * * *"

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  stale:
    uses: ${ref("stale")}
    secrets: inherit
`,

	greetings: `\
name: Greetings

on: # yamllint disable-line rule:truthy
  pull_request:
  issues:

permissions:
  issues: write
  pull-requests: write

jobs:
  greetings:
    uses: ${ref("greetings")}
    secrets: inherit
`,

	dependencies: `\
name: Dependencies

on: # yamllint disable-line rule:truthy
  pull_request:

permissions:
  contents: write
  pull-requests: write

jobs:
  dependencies:
    uses: ${ref("dependencies")}
    secrets: inherit
`,

	"bookkeeping-pr": `\
name: PR Bookkeeping

on: # yamllint disable-line rule:truthy
  pull_request:
    types:
      - opened
      - edited

permissions:
  contents: read
  pull-requests: write

jobs:
  bookkeeping:
    uses: ${ref("bookkeeping-pr")}
    secrets: inherit
`,

	audit: `\
name: Audit

on: # yamllint disable-line rule:truthy
  push:
    branches: [main, alpha]
  pull_request:

permissions:
  contents: read

jobs:
  audit:
    uses: ${ref("audit")}
    secrets: inherit
`,

	"sync-github": `\
name: Sync GitHub Templates

on: # yamllint disable-line rule:truthy
  push:
    branches: [main, alpha]
    paths:
      - packages/cli/src/templates/index.ts
      - packages/cli/src/commands/setup-workflows.ts

concurrency:
  group: sync-github-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  sync:
    name: Sync
    uses: ${ref("sync-github")}
    with:
      secondary-repos: theholocron/.github-private
    secrets:
      SYNC_TOKEN: \${{ secrets.SYNC_TOKEN }}
`,
};

export const KNOWN_WORKFLOWS = new Set(Object.keys(WORKFLOW_TEMPLATES));

/**
 * GitHub check context name each CI workflow produces on a PR.
 *
 * The format is "{caller-workflow-name} / {reusable-job-name}". The caller
 * job's own `name:` field does NOT appear in the external check name — only
 * the calling workflow's top-level `name:` and the inner reusable-workflow
 * job name matter. Only workflows that gate merges are listed here.
 */
export const WORKFLOW_CHECK_CONTEXTS: Partial<Record<string, string>> = {
	lint: "Lint / Lint entire codebase",
	test: "Test / Run tests and collect coverage",
	typecheck: "Typecheck / tsc --noEmit",
};

/**
 * Generate the thin caller content for a workflow, optionally injecting
 * `with:` inputs before `secrets: inherit` in the jobs block.
 */
export function generateThinCallerContent(name: string, withOverrides?: Record<string, unknown>): string {
	const base = WORKFLOW_TEMPLATES[name];
	if (!base) return "";
	if (!withOverrides || Object.keys(withOverrides).length === 0) return base;
	const withBlock = Object.entries(withOverrides)
		.map(([k, v]) => `      ${k}: ${v === true ? "true" : v === false ? "false" : String(v)}`)
		.join("\n");
	return base.replace(/ {4}secrets: inherit\n$/, `    with:\n${withBlock}\n    secrets: inherit\n`);
}
