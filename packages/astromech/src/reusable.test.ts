import { describe, expect, it } from "vitest";

import { REUSABLE_ACTIONS, REUSABLE_WORKFLOWS, reusableTemplates, WORKFLOW_TEMPLATE_PROPERTIES } from "./reusable.js";
import { WORKFLOW_TEMPLATES } from "./thin-callers.js";

describe("reusableTemplates()", () => {
	const batch = reusableTemplates();

	it("emits actions, reusable workflows, workflow-templates and their properties", () => {
		const expected =
			Object.keys(REUSABLE_ACTIONS).length +
			Object.keys(REUSABLE_WORKFLOWS).length +
			Object.keys(WORKFLOW_TEMPLATES).length +
			Object.keys(WORKFLOW_TEMPLATE_PROPERTIES).length;
		expect(batch.size).toBe(expected);

		for (const name of Object.keys(REUSABLE_ACTIONS)) {
			expect(batch.has(`.github/actions/${name}.yml`)).toBe(true);
		}
		for (const name of Object.keys(REUSABLE_WORKFLOWS)) {
			expect(batch.has(`.github/workflows/${name}.yml`)).toBe(true);
		}
		for (const name of Object.keys(WORKFLOW_TEMPLATES)) {
			expect(batch.has(`workflow-templates/${name}.yml`)).toBe(true);
		}
	});

	it("ships the holocron composite action that CI jobs use to run a task", () => {
		expect(REUSABLE_ACTIONS).toHaveProperty("holocron/action");
		const action = batch.get(".github/actions/holocron/action.yml")!;
		expect(action).toBeDefined();
		expect(action).toContain("name: Holocron");
		expect(action).toContain("using: composite");
		// inputs reach `run:` only through env — no `${{ }}` inside a shell script
		expect(action).toContain("HOLOCRON_TASK: ${{ inputs.task }}");
		expect(action).not.toMatch(/run:[^\n]*\$\{\{\s*inputs\./);
		// invokes the built entry directly — a .bin shim pnpm doesn't create for
		// an unbuilt workspace package
		expect(action).toContain('require.resolve("@theholocron/cli")');
		expect(action).toContain('node "$cli" "$@"');
		expect(action).not.toMatch(/^\s+run: pnpm exec holocron/m);
		// generalised beyond `run` — any subcommand via `command:` (holocron#655)
		expect(action).toContain("HOLOCRON_COMMAND: ${{ inputs.command }}");
		expect(action).toMatch(/if \[ "\$HOLOCRON_COMMAND" = "run" \]/);
	});

	it("platform.repoSync.yml runs `holocron sync` through the holocron action — not a hard-coded packages/cli path (holocron#655)", () => {
		const wf = REUSABLE_WORKFLOWS["platform.repoSync"]!;
		expect(wf).toContain("uses: theholocron/.github/.github/actions/holocron@main");
		expect(wf).toMatch(/command: sync/);
		expect(wf).not.toContain("node packages/cli/dist/cli.mjs");
		// the standalone `pnpm build` step is gone — the action handles it
		expect(wf).not.toMatch(/^\s+- run: pnpm build\n\s+name: Build CLI/m);
	});

	it("applies the do-not-edit header to YAML — no timestamp", () => {
		const typecheck = batch.get(".github/workflows/verification.typeSafety.yml")!;
		expect(typecheck.startsWith("# AUTO-GENERATED — do not edit in theholocron/.github directly.\n")).toBe(true);
		expect(typecheck).toContain("# Source:  theholocron/holocron · packages/astromech/src/reusable.ts");
		expect(typecheck).toContain("# Tool:    holocron sync-github");
		// A live `Synced:` timestamp would defeat sync-github's unchanged-file skip.
		expect(typecheck).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
		expect(typecheck).not.toContain("Synced:");
		// header, then the real workflow
		expect(typecheck).toContain("\nname: Typecheck\n");
	});

	it("leaves the starter-workflow .properties.json bare (native JSON, no header)", () => {
		const props = batch.get("workflow-templates/bookkeeping.properties.json")!;
		expect(props.startsWith("#")).toBe(false);
		expect(JSON.parse(props)).toMatchObject({ name: "Bookkeeping", iconName: "octicon tag" });
	});

	it("adds a .properties.json only for templates that have properties", () => {
		const propsKeys = [...batch.keys()].filter((k) => k.endsWith(".properties.json"));
		expect(propsKeys).toEqual(["workflow-templates/bookkeeping.properties.json"]);
	});
});

describe("REUSABLE_WORKFLOWS — the CI suite runs `holocron run`", () => {
	it("verification.typeSafety.yml runs the task through the holocron action", () => {
		const wf = REUSABLE_WORKFLOWS["verification.typeSafety"]!;
		expect(wf).toContain("uses: theholocron/.github/.github/actions/holocron@main");
		expect(wf).toMatch(/task: verification\.typeSafety/);
		expect(wf).not.toContain("run: pnpm typecheck");
	});

	it("verification.unitTests.yml unit job runs the task through the holocron action", () => {
		const wf = REUSABLE_WORKFLOWS["verification.unitTests"]!;
		expect(wf).toContain("uses: theholocron/.github/.github/actions/holocron@main");
		expect(wf).toMatch(/task: verification\.unitTests/);
		expect(wf).not.toContain("run: pnpm test:coverage");
	});

	it("delivery.publish.yml uploads coverage for the [skip ci] release commit (holocron#644)", () => {
		const wf = REUSABLE_WORKFLOWS["delivery.publish"]!;
		// detect the release commit semantic-release just pushed
		expect(wf).toMatch(/BEFORE=\$\(git rev-parse HEAD\)/);
		expect(wf).toMatch(/echo "commit=\$AFTER" >> "\$GITHUB_OUTPUT"/);
		// run tests + upload, keyed to that SHA so the next PR compares cleanly
		expect(wf).toMatch(/if: \$\{\{ steps\.release\.outputs\.commit != '' \}\}/);
		expect(wf).toContain("override_commit: ${{ steps.release.outputs.commit }}");
		expect(wf).toContain("codecov/codecov-action@");
	});

	it("the audit-derived tasks each run through the holocron action, decomposed into separate workflows", () => {
		const build = REUSABLE_WORKFLOWS["delivery.bundleSize"]!;
		expect(build).toMatch(/task: delivery\.build/);

		const knip = REUSABLE_WORKFLOWS["sourceQuality.deadCodeAnalysis"]!;
		expect(knip).toMatch(/task: sourceQuality\.deadCodeAnalysis/);

		const performance = REUSABLE_WORKFLOWS["verification.performance"]!;
		expect(performance).toMatch(/task: verification\.performance\n\s+args: --config=/);
		expect(performance).toContain("LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}");
	});

	it("the lint-derived tasks each run through the holocron action, decomposed into separate workflows", () => {
		expect(REUSABLE_WORKFLOWS["sourceQuality.staticAnalysis"]).toMatch(/task: sourceQuality\.staticAnalysis/);
		expect(REUSABLE_WORKFLOWS["sourceQuality.formatting"]).toMatch(/task: sourceQuality\.formatting/);
		expect(REUSABLE_WORKFLOWS["sourceQuality.structuredDataValidation"]).toMatch(
			/task: sourceQuality\.structuredDataValidation/
		);
		expect(REUSABLE_WORKFLOWS["security.secretDetection"]).toMatch(/task: security\.secretDetection/);
		// commitlint and the repo-validation scripts have no local runner — they
		// don't go through the holocron composite action at all.
		expect(REUSABLE_WORKFLOWS["platform.commitStandards"]).toContain("commitlint --from");
		// --config <resolved shared path> (config-resolution workstream, #676),
		// guarded so it falls back to auto-discovery when the shared package
		// isn't installed.
		expect(REUSABLE_WORKFLOWS["platform.commitStandards"]).toContain(
			'COMMITLINT_CONFIG="node_modules/@theholocron/commitlint-config/dist/index.js"'
		);
		expect(REUSABLE_WORKFLOWS["platform.commitStandards"]).toContain('if [ -f "$COMMITLINT_CONFIG" ]; then');
		expect(REUSABLE_WORKFLOWS["platform.repoValidation"]).toMatch(/task: platform\.repoValidation\n\s+job: adrs/);
		expect(REUSABLE_WORKFLOWS["platform.repoValidation"]).toMatch(
			/task: platform\.repoValidation\n\s+job: registry/
		);
		expect(REUSABLE_WORKFLOWS["platform.repoValidation"]).toMatch(
			/task: platform\.repoValidation\n\s+job: docsPresence/
		);
	});

	it("no reusable workflow invokes the super-linter action anymore (D12)", () => {
		for (const wf of Object.values(REUSABLE_WORKFLOWS)) {
			expect(wf).not.toContain("super-linter/super-linter");
		}
	});
});

describe("REUSABLE_WORKFLOWS['platform.dispatchedCheck'] — Sentinel's Bucket 2 dispatch target (holocron#794)", () => {
	const wf = REUSABLE_WORKFLOWS["platform.dispatchedCheck"]!;

	it("is workflow_dispatch-triggered, not workflow_call — Sentinel invokes it directly via the Actions API", () => {
		expect(wf).toContain("workflow_dispatch:");
		expect(wf).not.toContain("workflow_call:");
	});

	it("has no WORKFLOW_TEMPLATES/thin-caller entry — no repo invokes this itself", () => {
		expect(WORKFLOW_TEMPLATES).not.toHaveProperty("platform.dispatchedCheck");
	});

	it("checks out the target repo/ref from the dispatch inputs, not the calling repo", () => {
		expect(wf).toMatch(/repository: \$\{\{ inputs\.repo \}\}/);
		expect(wf).toMatch(/ref: \$\{\{ inputs\.ref \}\}/);
	});

	it("mints its own installation token from stored App credentials — never a token passed through an input", () => {
		expect(wf).toContain("actions/create-github-app-token@");
		expect(wf).toContain("app-id: ${{ secrets.SENTINEL_APP_ID }}");
		expect(wf).toContain("private-key: ${{ secrets.SENTINEL_APP_PRIVATE_KEY }}");
		expect(wf).not.toMatch(/token:\s*\$\{\{\s*inputs\./);
	});

	it("scopes the minted token to the parsed target repo, not the default current-repo scope (holocron#794 live test finding)", () => {
		expect(wf).toContain('echo "owner=${INPUT_REPO%%/*}" >> "$GITHUB_OUTPUT"');
		expect(wf).toContain('echo "name=${INPUT_REPO##*/}" >> "$GITHUB_OUTPUT"');
		expect(wf).toContain("owner: ${{ steps.target.outputs.owner }}");
		expect(wf).toContain("repositories: ${{ steps.target.outputs.name }}");
	});

	it("runs the dispatched task through the holocron action, not a hard-coded command", () => {
		expect(wf).toContain("uses: theholocron/.github/.github/actions/holocron@main");
		expect(wf).toContain("task: ${{ inputs.task }}");
	});

	it("patches the check run back on the target repo regardless of task outcome", () => {
		expect(wf).toContain("continue-on-error: true");
		expect(wf).toMatch(/if: always\(\)/);
		expect(wf).toContain('gh api --method PATCH "/repos/${REPO}/check-runs/${CHECK_RUN_ID}"');
		expect(wf).toContain("CONCLUSION: ${{ steps.run-task.outcome == 'success' && 'success' || 'failure' }}");
	});
});

describe("REUSABLE_WORKFLOWS['knowledge.wiki'] — preview deployment widget", () => {
	const wiki = REUSABLE_WORKFLOWS["knowledge.wiki"]!;

	it("reads the preview URL from Fern's output, not a constructed string", () => {
		expect(wiki).toContain("id: preview");
		expect(wiki).toMatch(/grep -o\w*E ["']https:\/\/\[a-z0-9\.-\]\+\\\.docs\\\.buildwithfern\\\.com/);
		expect(wiki).toContain('echo "url=$url" >> "$GITHUB_OUTPUT"');
	});

	it("no longer gates the deployment step on fern-org, and keeps it as a fallback only", () => {
		// the step runs for every preview now …
		expect(wiki).toMatch(/Report preview URL\n\s+if: \$\{\{ inputs\.preview && inputs\.preview-id != '' \}\}/);
		// … using the captured URL, falling back to the fern-org construction
		expect(wiki).toContain('PREVIEW_URL="$CAPTURED_URL"');
		expect(wiki).toContain('if [ -z "$PREVIEW_URL" ] && [ -n "$FERN_ORG" ]; then');
	});

	it("keeps the fern-org / base-path inputs (callers still pass them) but marks them deprecated", () => {
		expect(wiki).toMatch(/^\s+fern-org:/m);
		expect(wiki).toMatch(/^\s+base-path:/m);
		expect(wiki).toMatch(/fern-org:\n\s+description: >\n\s+DEPRECATED/);
	});
});
