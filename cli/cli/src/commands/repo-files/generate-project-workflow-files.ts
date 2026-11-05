// editorconfig-checker-disable-file -- the workflow below is YAML in a template string, indented with spaces on purpose
import { createHeader } from "@theholocron/astromech";
import { findRootSync } from "@theholocron/fs-utils";

import { resolveProjectOptions } from "../project/project-options/index.js";
import { resolvePkgRelPath } from "../workflow-source-marker/index.js";
import type { GeneratedRepoFile, RepoFilesInput } from "./repo-files.type.js";

/** Where the scheduled reconcile workflow is written. */
export const PROJECT_RECONCILE_WORKFLOW = ".github/workflows/platform.projectReconcile.yml";

/**
 * The workflow's own name. `platform.notifications.yml` lists it under `workflow_run`, so a run that fails on the
 * default branch posts to #alerts with the gatekeepers ping.
 */
export const PROJECT_RECONCILE_NAME = "Project reconcile";

/** The Actions secrets that hold the GitHub App's id and private key the run mints its installation token from. */
export const PROJECT_APP_SECRETS = { id: "SENTINEL_APP_ID", privateKey: "SENTINEL_APP_PRIVATE_KEY" } as const;

const { workflowHeader } = createHeader({
	source: "cli/cli/src/commands/repo-files/generate-project-workflow-files.ts",
	tool: "holocron repo sync",
});

function workflow(owner: string): string {
	return `name: ${PROJECT_RECONCILE_NAME}

on: # yamllint disable-line rule:truthy
  schedule:
    - cron: "23 * * * *"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Only say what would change; set no status"
        type: boolean
        default: false

permissions:
  contents: read

# One run at a time: two could set the same item twice.
concurrency:
  group: project-reconcile
  cancel-in-progress: false

jobs:
  reconcile:
    name: Reconcile and check the boards
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      # \`GITHUB_TOKEN\` cannot write an organization project, so the run uses the GitHub App's installation token.
      # The App needs the organization Projects permission (read and write), which setup cannot grant: a person does.
      - name: Generate GitHub App token
        id: app-token
        uses: actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510 # v3.3.0
        with:
          app-id: \${{ secrets.${PROJECT_APP_SECRETS.id} }}
          private-key: \${{ secrets.${PROJECT_APP_SECRETS.privateKey} }}
          owner: ${owner}
          permission-organization-projects: write
          permission-issues: read
          permission-pull-requests: read

      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        name: Checkout repository

      - uses: theholocron/.github/.github/actions/setup@main
        name: Setup

      - uses: theholocron/.github/.github/actions/holocron@main
        name: Reconcile the boards
        id: reconcile
        with:
          command: project reconcile
          args: >-
            \${{ inputs.dry_run && '--dry-run' || '' }}
            --token github=\${{ steps.app-token.outputs.token }}

      - name: List what changed
        if: \${{ !cancelled() && steps.reconcile.outputs.log-file != '' }}
        env:
          LOG_FILE: \${{ steps.reconcile.outputs.log-file }}
        run: |
          {
            echo "### Project reconcile"
            echo '\`\`\`'
            cat "$LOG_FILE"
            echo '\`\`\`'
          } >> "$GITHUB_STEP_SUMMARY"

      # What reconcile cannot fix: an item with no status, a board that differs from its template, a rule that is off, a
      # missing App permission. A failure here fails the run, and the run's failure reaches #alerts.
      - uses: theholocron/.github/.github/actions/holocron@main
        name: Check the boards
        if: \${{ !cancelled() }}
        with:
          command: doctor project
          args: >-
            --token github=\${{ steps.app-token.outputs.token }}
`;
}

/**
 * The scheduled workflow that keeps the declared boards true (spec `command-project`, "Keeping a board true"): hourly
 * and on demand it runs `holocron project reconcile`, then `holocron doctor project`, with a token minted from the
 * GitHub App. Written only when `providers.projects` declares boards, and for the owner the boards belong to, so a repo
 * without boards gets no file. A generated file, so `probe generated check` compares it with the committed copy.
 */
export function generateProjectWorkflowFiles(input: RepoFilesInput): GeneratedRepoFile[] {
	const config = input.loaded.resolved;
	const entry = config.providers.projects;
	const tuple = entry?.cardinality === "single" ? entry.tuple : entry?.tuples[0];
	if (!tuple) return [];
	const resolved = resolveProjectOptions(tuple.options as Record<string, unknown>, config.org ?? "");
	if (!resolved.ok || resolved.options.boards.length === 0 || resolved.options.owner === "") return [];

	const gitRoot = findRootSync(input.repoRoot, ".git", { fallback: "start", realpath: true }) as string;
	const pkgRelPath = resolvePkgRelPath(gitRoot, input.loaded.filepath);
	return [
		{
			kind: "file",
			path: PROJECT_RECONCILE_WORKFLOW,
			content: `${workflowHeader()}# Source package: ${pkgRelPath}\n\n${workflow(resolved.options.owner)}`,
			step: "write workflow project reconcile",
			syncStep: "sync workflow project reconcile",
		},
	];
}
