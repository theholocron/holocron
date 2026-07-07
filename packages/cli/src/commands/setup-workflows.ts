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

export const WORKFLOW_TEMPLATES: Record<string, string> = {
	lint: `\
name: Lint

on: # yamllint disable-line rule:truthy
  push:
  pull_request:

concurrency:
  group: lint-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: write
  statuses: write

jobs:
  lint:
    uses: ${ref("lint")}
    secrets: inherit
    with:
      enable-auto-commit: true
`,

	test: `\
name: Test

on: # yamllint disable-line rule:truthy
  push:
  pull_request:

concurrency:
  group: test-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  test:
    uses: ${ref("test")}
    secrets: inherit
`,

	typecheck: `\
name: Typecheck

on: # yamllint disable-line rule:truthy
  push:
  pull_request:

concurrency:
  group: typecheck-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  typecheck:
    uses: ${ref("typecheck")}
    secrets: inherit
`,

	codeql: `\
name: CodeQL

on:
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

permissions:
  contents: read
  checks: write
  pull-requests: write

jobs:
  review:
    uses: ${ref("review")}
    secrets: inherit
`,

	release: `\
name: Release

on:
  push:
    branches:
      - main

permissions:
  contents: write
  id-token: write
  issues: write
  pull-requests: write

jobs:
  release:
    uses: ${ref("release")}
    secrets: inherit
`,

	stale: `\
name: Stale

on:
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

on:
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

permissions:
  contents: read

jobs:
  audit:
    uses: ${ref("audit")}
    secrets: inherit
`,
};

export const KNOWN_WORKFLOWS = new Set(Object.keys(WORKFLOW_TEMPLATES));
