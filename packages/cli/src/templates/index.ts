/**
 * All reusable workflow and composite action content bundled as string
 * constants so the CLI can push them to theholocron/.github without
 * needing filesystem access at runtime.
 *
 * These are the sources of truth — the YAML files in this directory
 * have been removed in favour of these constants.
 */

export const ACTIONS: Record<string, string> = {
	"setup/action": `\
name: Setup
description: Prepare the environment and install project dependencies.

inputs:
  node-version:
    description: Node.js version
    required: false
    default: "22.x"

runs:
  using: composite

  steps:
    - uses: theholocron/.github/.github/actions/setup-node@main
      with:
        node-version: \${{ inputs.node-version }}

    - uses: theholocron/.github/.github/actions/install@main
`,

	"install/action": `\
name: Install dependencies
description: Install project dependencies with pnpm frozen lockfile.

runs:
  using: composite

  steps:
    - name: Install dependencies
      if: \${{ hashFiles('pnpm-lock.yaml') != '' }}
      shell: bash
      run: pnpm install --frozen-lockfile
`,

	"setup-node/action": `\
name: Setup Node
description: Install pnpm and Node.js with pnpm dependency caching.

inputs:
  node-version:
    description: Node.js version
    required: false
    default: "22.x"

runs:
  using: composite

  steps:
    - name: Setup pnpm
      if: \${{ hashFiles('pnpm-lock.yaml') != '' }}
      uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4

    - name: Setup Node.js
      uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
      with:
        node-version: \${{ inputs.node-version }}
        cache: \${{ hashFiles('pnpm-lock.yaml') != '' && 'pnpm' || '' }}

    - name: Add node_modules/.bin to PATH
      shell: bash
      run: echo "$GITHUB_WORKSPACE/node_modules/.bin" >> $GITHUB_PATH
`,
};

export const REUSABLE_WORKFLOWS: Record<string, string> = {
	audit: `\
name: Audit

on: # yamllint disable-line rule:truthy
  workflow_call:
    inputs:
      build-script:
        description: Script to build and upload bundle stats to Codecov
        type: string
        required: false
        default: pnpm build
    secrets:
      CODECOV_TOKEN:
        required: false

jobs:
  bundle-size:
    name: Audit the bundle size
    permissions:
      contents: read
    runs-on: ubuntu-latest
    timeout-minutes: 15
    concurrency:
      group: audit-\${{ github.ref }}
      cancel-in-progress: true
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
        name: Checkout repository
        with:
          fetch-depth: 0

      - uses: theholocron/.github/.github/actions/setup@main
        name: Setup

      - run: \${{ inputs.build-script }}
        name: Build and upload bundle stats
        env:
          CODECOV_TOKEN: \${{ secrets.CODECOV_TOKEN }}
`,

	"bookkeeping-pr": `\
name: PR Bookkeeping

on: # yamllint disable-line rule:truthy
  workflow_call:
    inputs:
      configuration-path:
        description: Path to the labeler configuration file in the calling repo
        type: string
        required: false
        default: .github/labeler.yml

jobs:
  label:
    name: Add Labels to PRs
    permissions:
      contents: read
      pull-requests: write
    runs-on: ubuntu-latest
    timeout-minutes: 5
    concurrency:
      group: bookkeeping-pr-\${{ github.event.pull_request.number }}
      cancel-in-progress: true
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
        with:
          sparse-checkout: \${{ inputs.configuration-path || '.github/labeler.yml' }}
          sparse-checkout-cone-mode: false

      - uses: github/issue-labeler@c1b0f9f52a63158c4adc09425e858e87b32e9685 # v3.4
        if: \${{ hashFiles(inputs.configuration-path || '.github/labeler.yml') != '' }}
        with:
          # Fall back to default path when triggered directly (not via workflow_call)
          # because inputs.* defaults only apply on workflow_call events.
          configuration-path: \${{ inputs.configuration-path || '.github/labeler.yml' }}
          include-title: 1
          include-body: 0
          sync-labels: 1
          enable-versioned-regex: 0
          repo-token: \${{ github.token }}
`,

	codeql: `\
name: CodeQL

on: # yamllint disable-line rule:truthy
  workflow_call:
    inputs:
      language:
        description: CodeQL language to analyze
        type: string
        required: false
        default: javascript-typescript

jobs:
  analyze:
    name: Analyze (\${{ inputs.language }})
    permissions:
      actions: read
      contents: read
      security-events: write
    runs-on: ubuntu-latest
    timeout-minutes: 45
    # Do not cancel in-progress security scans.
    concurrency:
      group: codeql-\${{ github.ref }}
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
        name: Checkout repository

      - uses: github/codeql-action/init@99df26d4f13ea111d4ec1a7dddef6063f76b97e9 # v4.37.0
        name: Initialize CodeQL
        with:
          languages: \${{ inputs.language }}

      - uses: github/codeql-action/autobuild@99df26d4f13ea111d4ec1a7dddef6063f76b97e9 # v4.37.0
        name: Autobuild

      - uses: github/codeql-action/analyze@99df26d4f13ea111d4ec1a7dddef6063f76b97e9 # v4.37.0
        name: Analyze
        with:
          category: /language:\${{ inputs.language }}
`,

	dependencies: `\
name: Dependencies

on: # yamllint disable-line rule:truthy
  workflow_call:
    secrets:
      merge-token:
        description: >
          Optional privileged token for auto-merge. Falls back to GITHUB_TOKEN.
          Required when branch protection enforces required reviews — GITHUB_TOKEN
          cannot approve its own PRs.
        required: false

jobs:
  dependabot:
    name: Update the dependencies
    permissions:
      contents: write
      pull-requests: write
    runs-on: ubuntu-latest
    timeout-minutes: 5
    concurrency:
      group: dependencies-\${{ github.event.pull_request.number }}
      cancel-in-progress: true
    if: github.event.pull_request.user.login == 'dependabot[bot]'
    steps:
      - uses: dependabot/fetch-metadata@25dd0e34f4fe68f24cc83900b1fe3fe149efef98 # v3.1.0
        name: Fetch Dependabot metadata
        id: metadata

      - run: gh pr merge --auto --squash "$PR_URL"
        # --squash is intentional: repoPolicy sets allow_merge_commit: false,
        # so --merge would fail on any repo using the standard preset.
        name: Enable auto-merge for Dependabot PRs
        if: steps.metadata.outputs.update-type == 'version-update:semver-patch'
        env:
          PR_URL: \${{ github.event.pull_request.html_url }}
          GH_TOKEN: \${{ secrets.merge-token || github.token }}
`,

	greetings: `\
name: Greetings

on: # yamllint disable-line rule:truthy
  workflow_call:

jobs:
  greeting:
    name: Greet first-time contributors
    permissions:
      issues: write
      pull-requests: write
    runs-on: ubuntu-latest
    timeout-minutes: 5
    # Group by the issue/PR number so duplicate events don't race each other.
    concurrency:
      group: greetings-\${{ github.event.issue.number || github.event.pull_request.number }}
      cancel-in-progress: false
    steps:
      - uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3 # v9.0.0
        name: Greet on first contribution
        with:
          script: |
            // Only greet on the initial open — ignore synchronize, reopened, etc.
            if (context.payload.action !== 'opened') return;

            const actor = context.actor;
            const { owner, repo } = context.repo;

            // Payload inspection is more reliable than context.eventName for detecting
            // whether this is an issue vs. PR event — works regardless of how GitHub
            // propagates event names through workflow_call chains.
            const isIssue = !!context.payload.issue && !context.payload.pull_request;
            // listForRepo returns both issues and PRs (GitHub treats PRs as issues),
            // sorted newest-first. Filter by type to track first-issue and first-PR
            // independently, and avoid search-index eventual-consistency lag.
            const { data: recent } = await github.rest.issues.listForRepo({
              owner, repo,
              creator: actor,
              state: 'all',
              per_page: 100
            });

            const sameType = recent.filter(item =>
              isIssue ? !item.pull_request : !!item.pull_request
            );

            if (sameType.length !== 1) return;
            const body = isIssue
              ? \`Hey @\${actor}!\\n\\nWe really appreciate you taking the time to report an issue. The collaborators on this project attempt to help as many people as possible, but we are a limited number of volunteers, so it is possible that this will not be addressed as swiftly.\\n\\nYour patience is much appreciated and we will get back to you as quickly as possible.\`
              : \`Hey @\${actor}!\\n\\nWe really appreciate you taking the time to help out with this PR. The collaborators on this project attempt to help as many people as possible, but we are a limited number of volunteers, so it is possible that this will not be addressed as swiftly.\\n\\nYour patience is much appreciated and we will get back to you as quickly as possible.\`;

            await github.rest.issues.createComment({
              owner,
              repo,
              issue_number: context.issue.number,
              body
            });
`,

	lint: `\
name: Lint

on: # yamllint disable-line rule:truthy
  workflow_call:
    inputs:
      prettier-config:
        type: string
        required: false
        default: prettier.config.js
      yaml-config:
        type: string
        required: false
        default: yamllint.config.yml
      enable-auto-commit:
        description: Auto-commit super-linter fixes via GPG-signed commit
        type: boolean
        required: false
        default: false
    secrets:
      SUPER_LINTER_GPG_PRIVATE_KEY:
        required: false
      SUPER_LINTER_GPG_PASSPHRASE:
        required: false

jobs:
  super-lint:
    name: Lint entire codebase
    permissions:
      contents: write
      statuses: write
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      GPG_KEY_SET: \${{ secrets.SUPER_LINTER_GPG_PRIVATE_KEY != '' }}
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
        name: Checkout repository
        with:
          fetch-depth: 0
          token: \${{ github.token }}

      - uses: theholocron/.github/.github/actions/setup@main
        name: Setup
        if: \${{ hashFiles('pnpm-lock.yaml') != '' }}

      - uses: super-linter/super-linter/slim@4ce20838b8ab83717e78138c5b3a1407148e0918 # v8.7.0
        name: Run Super Linter
        env:
          GITHUB_TOKEN: \${{ github.token }}
          DEFAULT_BRANCH: \${{ github.event.pull_request.base.ref || github.event.repository.default_branch }}
          ANNOTATE_ONLY: true
          DISABLE_COMMENTS: false
          IGNORE_GITIGNORED_FILES: true
          LINTER_RULES_PATH: /
          EDITORCONFIG_FILE_NAME: ".editorconfig-checker.json"
          FIX_ENV: true
          FIX_GRAPHQL_PRETTIER: true
          FIX_HTML_PRETTIER: true
          FIX_JAVASCRIPT_PRETTIER: true
          FIX_JSX_PRETTIER: true
          FIX_MARKDOWN_PRETTIER: true
          FIX_TSX: true
          FIX_TYPESCRIPT_PRETTIER: true
          PRETTIER_CONFIG: \${{ inputs.prettier-config }}
          VALIDATE_DOCKERFILE: true
          VALIDATE_EDITORCONFIG: true
          VALIDATE_ENV: true
          VALIDATE_GIT_COMMITLINT: true
          VALIDATE_GIT_MERGE_CONFLICT_MARKERS: true
          VALIDATE_GITHUB_ACTIONS: true
          VALIDATE_GITLEAKS: true
          VALIDATE_GRAPHQL_PRETTIER: true
          VALIDATE_HTML_PRETTIER: true
          VALIDATE_JAVASCRIPT_PRETTIER: true
          VALIDATE_JSX_PRETTIER: true
          VALIDATE_MARKDOWN_PRETTIER: true
          VALIDATE_TSX: true
          VALIDATE_TYPESCRIPT_PRETTIER: true
          VALIDATE_YAML: true
          YAML_CONFIG_FILE: \${{ inputs.yaml-config }}

      - uses: crazy-max/ghaction-import-gpg@2dc316deee8e90f13e1a351ab510b4d5bc0c82cd # v7.0.0
        name: Import GPG Key
        # Conditions mirror auto-commit exactly — no point importing GPG if the
        # commit step will be skipped (fork PR, default branch, or secret unset).
        if: >
          inputs.enable-auto-commit == true &&
          github.event.pull_request != null &&
          github.event.pull_request.head.repo.full_name == github.repository &&
          github.ref_name != github.event.repository.default_branch &&
          env.GPG_KEY_SET == 'true'
        with:
          git_user_signingkey: true
          git_commit_gpgsign: true
          GPG_PRIVATE_KEY: \${{ secrets.SUPER_LINTER_GPG_PRIVATE_KEY }}
          PASSPHRASE: \${{ secrets.SUPER_LINTER_GPG_PASSPHRASE }}

      - uses: stefanzweifel/git-auto-commit-action@4a55954c782fc1ea30b9056cd3e7a2b40ca8887d # v7.2.0
        name: Commit and push linting fixes
        if: >
          inputs.enable-auto-commit == true &&
          github.event.pull_request != null &&
          github.event.pull_request.head.repo.full_name == github.repository &&
          github.ref_name != github.event.repository.default_branch &&
          env.GPG_KEY_SET == 'true'
        with:
          branch: \${{ github.event.pull_request.head.ref || github.head_ref || github.ref }}
          commit_message: "chore: fix linting issues"
          commit_options: "--no-verify --signoff"
          commit_user_name: super-linter
          commit_user_email: super-linter@super-linter.dev
`,

	release: `\
name: Release

# Semantic-release with OIDC Trusted Publishing — no NPM_TOKEN required.
# The calling repo must have a .releaserc.json that configures branches,
# plugins, and any publish options. npm@11+ is installed to support OIDC.

on: # yamllint disable-line rule:truthy
  workflow_call:
    inputs:
      run-build:
        description: Run \`pnpm build\` before releasing
        type: boolean
        required: false
        default: true
    secrets:
      SYNC_TOKEN:
        description: >
          Optional PAT with Contents write access. Required when the default
          branch is protected by a ruleset — github.token cannot push through
          rulesets, but a PAT with admin bypass can. Falls back to github.token.
        required: false

jobs:
  release:
    name: Semantic release
    permissions:
      contents: write
      id-token: write
      issues: write
      pull-requests: write
    runs-on: ubuntu-latest
    timeout-minutes: 30
    # Do not cancel in-progress releases — a partial release is worse than a slow one.
    concurrency:
      group: release-\${{ github.ref }}
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
        name: Checkout repository
        with:
          fetch-depth: 0
          # Use SYNC_TOKEN when available — git push (tags, release commits)
          # uses the checkout credential, not GITHUB_TOKEN env var. The
          # built-in github.token cannot push through branch protection rulesets.
          token: \${{ secrets.SYNC_TOKEN || github.token }}

      - uses: theholocron/.github/.github/actions/setup@main
        name: Setup

      - name: Configure git identity
        run: |
          GIT_NAME=$(gh api user --jq .name 2>/dev/null || echo "github-actions[bot]")
          GIT_EMAIL=$(gh api user --jq '"\\(.id)+\\(.login)@users.noreply.github.com"' 2>/dev/null || echo "41898282+github-actions[bot]@users.noreply.github.com")
          git config --global user.name "$GIT_NAME"
          git config --global user.email "$GIT_EMAIL"
          git config --global format.signoff true
        env:
          GH_TOKEN: \${{ secrets.SYNC_TOKEN || github.token }}

      - run: npm install -g npm@11 sigstore
        name: Upgrade npm for OIDC support
        # sigstore is required by libnpmpublish/provenance.js at module parse
        # time — before any config takes effect. Some npm 11.x builds stopped
        # bundling it; installing it globally into the same prefix ensures it
        # resolves regardless of npm version. (Discovered 2026-07-09.)

      - run: pnpm build
        name: Build
        if: \${{ inputs.run-build == true }}

      - run: npx semantic-release
        name: Release
        env:
          # Prefer SYNC_TOKEN (a PAT with Contents write) when available —
          # the built-in github.token cannot push to protected default branches
          # because rulesets block non-PAT pushes. Falls back to github.token
          # for repos without branch protection.
          GITHUB_TOKEN: \${{ secrets.SYNC_TOKEN || github.token }}
          NPM_CONFIG_PROVENANCE: true
`,

	review: `\
name: Review

# ReviewDog is the annotation layer — posts inline PR diff annotations.
# Runs on pull_request only: inline annotations require PR context,
# and branch protection ensures all changes go through PRs anyway.
# super-linter (lint.yml) is the CI gate covering push + PR events.
# Gitleaks and YAML are intentionally duplicated: super-linter gates
# merges; ReviewDog surfaces exact line annotations in the PR diff.

on: # yamllint disable-line rule:truthy
  workflow_call:

concurrency:
  group: review-\${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  reviewdog:
    name: Review PRs
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: read
      checks: write
      pull-requests: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0

      - name: Setup
        if: \${{ hashFiles('pnpm-lock.yaml') != '' }}
        uses: theholocron/.github/.github/actions/setup@main

      - name: Install ReviewDog
        uses: reviewdog/action-setup@d8a7baabd7f3e8544ee4dbde3ee41d0011c3a93f # v1
        with:
          reviewdog_version: latest

      # Detect which tools are relevant for this repo, excluding node_modules.
      # hashFiles('**/*') recurses into node_modules/.pnpm and produces false
      # positives for repos that don't own those file types.
      # -print -quit stops find after the first match without a pipe, avoiding
      # the SIGPIPE/pipefail exit-141 that find|head-1 triggers under
      # GitHub Actions' default bash --noprofile --norc -e -o pipefail mode.
      - name: Detect project features
        id: detect
        shell: bash
        run: |
          has() { find . -not -path '*/node_modules/*' -name "$1" -print -quit 2>/dev/null | grep -q .; }
          has_ext() { find . -not -path '*/node_modules/*' -name "$1" -print -quit 2>/dev/null | grep -q .; }
          { { has 'eslint.config.js' || has 'eslint.config.mjs' || has 'eslint.config.cjs' || \\
              has 'eslint.config.ts' || has '.eslintrc' || has '.eslintrc.js' || \\
              has '.eslintrc.cjs' || has '.eslintrc.json' || has '.eslintrc.yaml' || \\
              has '.eslintrc.yml'; } && grep -qF '"eslint":' package.json 2>/dev/null; } && echo "eslint=true" >> "$GITHUB_OUTPUT" || echo "eslint=false" >> "$GITHUB_OUTPUT"
          { has 'tsconfig.json' && grep -qF '"typescript":' package.json 2>/dev/null; } && echo "tsconfig=true" >> "$GITHUB_OUTPUT" || echo "tsconfig=false" >> "$GITHUB_OUTPUT"
          has_ext '*.sh' && echo "shell=true" >> "$GITHUB_OUTPUT" || echo "shell=false" >> "$GITHUB_OUTPUT"
          has 'Dockerfile' || has_ext '*.Dockerfile' || has 'Containerfile' && \\
            echo "docker=true" >> "$GITHUB_OUTPUT" || echo "docker=false" >> "$GITHUB_OUTPUT"
          has_ext '.env*' && echo "dotenv=true" >> "$GITHUB_OUTPUT" || echo "dotenv=false" >> "$GITHUB_OUTPUT"
          has_ext '*.md' && echo "markdown=true" >> "$GITHUB_OUTPUT" || echo "markdown=false" >> "$GITHUB_OUTPUT"

      #
      # Always applicable
      #

      - name: Gitleaks (secrets)
        uses: reviewdog/action-gitleaks@2b7b5685e3e3eecddab5d30cfa04f18123031421 # v1
        with:
          reporter: github-pr-check

      - name: YamlLint
        uses: reviewdog/action-yamllint@b5f7217d8c815ae374d1d55840d5e569d82f01f0 # v1
        with:
          reporter: github-pr-check
          yamllint_flags: >-
            \${{ hashFiles('yamllint.config.yml') != ''
                && format('-c {0}/yamllint.config.yml {0}', github.workspace)
                || github.workspace }}

      - name: ActionLint (GitHub Actions)
        if: \${{ hashFiles('.github/workflows/*.yml', '.github/workflows/*.yaml') != '' }}
        uses: reviewdog/action-actionlint@6fb7acc99f4a1008869fa8a0f09cfca740837d9d # v1
        with:
          reporter: github-pr-check

      #
      # TypeScript / JavaScript
      #

      - name: ESLint
        if: steps.detect.outputs.eslint == 'true'
        uses: reviewdog/action-eslint@556a3fdaf8b4201d4d74d406013386aa4f7dab96 # v1.34.0
        with:
          reporter: github-pr-check
          eslint_flags: .

      - name: TypeScript
        if: steps.detect.outputs.tsconfig == 'true'
        uses: EPMatt/reviewdog-action-tsc@63d923a3c5b4497671940b8874f58a404e2351b5 # v1
        with:
          reporter: github-pr-check

      #
      # Shell
      #

      - name: ShellCheck
        if: steps.detect.outputs.shell == 'true'
        uses: reviewdog/action-shellcheck@4c07458293ac342d477251099501a718ae5ef86e # v1
        with:
          reporter: github-pr-check
          fail_level: none

      #
      # Docker
      #

      - name: Hadolint
        if: steps.detect.outputs.docker == 'true'
        uses: reviewdog/action-hadolint@1b2cfa6ba72072ad35158d7ff3aa49bbdc03506d # v1
        with:
          reporter: github-pr-check
          fail_level: none

      #
      # Environment files
      #

      - name: dotenv-linter
        if: steps.detect.outputs.dotenv == 'true'
        uses: dotenv-linter/action-dotenv-linter@afde61cfda2ecffe7bea35837b6f20b956c88689 # v3.0.0
        with:
          reporter: github-code-suggestions

      #
      # Documentation
      #

      - name: Alex (inclusive language)
        if: steps.detect.outputs.markdown == 'true'
        uses: reviewdog/action-alex@347481655add010a2ae302df34b57c9bcfa0d6e4 # v1
        with:
          reporter: github-pr-check
`,

	stale: `\
name: Stale

on: # yamllint disable-line rule:truthy
  workflow_call:
    inputs:
      days-before-stale:
        description: Days of inactivity before an issue is marked stale
        type: number
        required: false
        default: 30
      days-before-close:
        description: Days of inactivity after stale label before closing
        type: number
        required: false
        default: 5

jobs:
  stale:
    name: Mark stale issues and pull requests
    permissions:
      contents: write
      issues: write
      pull-requests: write
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/stale@1e223db275d687790206a7acac4d1a11bd6fe629 # v10.4.0
        name: Run Stale
        with:
          close-issue-message: >
            This issue was closed because it has been stalled for
            \${{ inputs.days-before-close }} days with no activity.
          days-before-close: \${{ inputs.days-before-close }}
          days-before-stale: \${{ inputs.days-before-stale }}
          exempt-all-pr-milestones: true
          stale-issue-label: wontfix
          stale-issue-message: >
            This issue is stale because it has been open \${{ inputs.days-before-stale }}
            days with no activity. Remove the stale label or comment, or this will be
            closed in \${{ inputs.days-before-close }} days.
          stale-pr-label: wontfix
          stale-pr-message: >
            This PR is stale because it has been open \${{ inputs.days-before-stale }}
            days with no activity. Remove the stale label or comment, or this will be
            closed in \${{ inputs.days-before-close }} days.
`,

	test: `\
name: Test

on: # yamllint disable-line rule:truthy
  workflow_call:
    secrets:
      CODECOV_TOKEN:
        required: false

jobs:
  unit:
    name: Run tests and collect coverage
    permissions:
      contents: read
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
        name: Checkout repository
        with:
          fetch-depth: 0

      - uses: theholocron/.github/.github/actions/setup@main
        name: Setup

      - run: pnpm test -- --coverage
        name: Run tests with coverage

      - uses: codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f # v7.0.0
        name: Upload coverage to Codecov
        with:
          token: \${{ secrets.CODECOV_TOKEN }}

      - uses: codecov/test-results-action@0fa95f0e1eeaafde2c782583b36b28ad0d8c77d3 # v1
        name: Upload test results to Codecov
        if: \${{ !cancelled() }}
        with:
          token: \${{ secrets.CODECOV_TOKEN }}
`,

	"sync-github": `\
name: Sync GitHub Templates

# Builds the holocron CLI from source and pushes updated workflow templates
# and composite actions to downstream .github repos. Runs whenever the
# template source files change on main or alpha.
#
# Secrets required:
#   SYNC_TOKEN — fine-grained PAT (resource owner: org) with:
#                  Contents:      Read and write  (git trees, blobs, refs)
#                  Pull requests: Read and write  (open sync PR)
#                  Workflows:     Read and write  (write .github/workflows/*.yml)

on: # yamllint disable-line rule:truthy
  workflow_call:
    inputs:
      primary-repo:
        description: >
          Primary .github repo — receives composite actions, reusable workflows,
          and thin-caller templates. Requires a PR (branch protection assumed).
        type: string
        required: false
        default: theholocron/.github
      secondary-repos:
        description: >
          Space-separated list of secondary repos (reusable workflows + thin
          callers only, no composite actions). Pushed directly to main.
        type: string
        required: false
        default: ""
      sync-branch:
        description: Branch name used for the primary-repo PR
        type: string
        required: false
        default: chore/sync-templates
    secrets:
      SYNC_TOKEN:
        required: true

jobs:
  sync:
    name: Sync templates
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
        name: Checkout repository

      - uses: theholocron/.github/.github/actions/setup@main
        name: Setup

      - run: pnpm build
        name: Build CLI

      - name: Validate generated workflows
        run: |
          node packages/cli/dist/cli.mjs sync-github \\
            --repo "$PRIMARY_REPO" \\
            --output-dir /tmp/sync-validate
          curl -fsSL https://github.com/rhysd/actionlint/releases/download/v1.7.7/actionlint_1.7.7_linux_amd64.tar.gz \\
            | tar -xz -C /tmp actionlint
          /tmp/actionlint /tmp/sync-validate/.github/workflows/*.yml
        env:
          PRIMARY_REPO: \${{ inputs.primary-repo }}

      - name: Sync primary repo (PR)
        run: |
          GIT_NAME=$(gh api user --jq .name 2>/dev/null || echo "github-actions[bot]")
          GIT_EMAIL=$(gh api user --jq '"\\(.id)+\\(.login)@users.noreply.github.com"' 2>/dev/null || echo "41898282+github-actions[bot]@users.noreply.github.com")
          node packages/cli/dist/cli.mjs sync-github \\
            --repo "$PRIMARY_REPO" \\
            --branch "$SYNC_BRANCH" \\
            --pr \\
            --message "chore: sync from theholocron/holocron

Signed-off-by: $GIT_NAME <$GIT_EMAIL>"
        env:
          GITHUB_TOKEN: \${{ secrets.SYNC_TOKEN }}
          GH_TOKEN: \${{ secrets.SYNC_TOKEN }}
          PRIMARY_REPO: \${{ inputs.primary-repo }}
          SYNC_BRANCH: \${{ inputs.sync-branch }}

      - name: Sync secondary repos (direct push)
        if: \${{ inputs.secondary-repos != '' }}
        run: |
          for repo in $SECONDARY_REPOS; do
            node packages/cli/dist/cli.mjs sync-github --repo "$repo"
          done
        env:
          GITHUB_TOKEN: \${{ secrets.SYNC_TOKEN }}
          SECONDARY_REPOS: \${{ inputs.secondary-repos }}
`,

	typecheck: `\
name: Typecheck

on: # yamllint disable-line rule:truthy
  workflow_call:

jobs:
  typecheck:
    name: tsc --noEmit
    permissions:
      contents: read
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
        name: Checkout repository

      - uses: theholocron/.github/.github/actions/setup@main
        name: Setup

      - run: pnpm typecheck
        name: Type check
`,
};

export const WORKFLOW_TEMPLATE_PROPERTIES: Record<string, string> = {
	"sync-github": JSON.stringify(
		{
			name: "Sync GitHub Templates",
			description: "Sync workflow templates and composite actions from the holocron CLI.",
			iconName: "octicon sync",
		},
		null,
		2
	),
};
