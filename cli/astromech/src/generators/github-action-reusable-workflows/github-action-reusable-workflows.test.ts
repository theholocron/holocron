import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKFLOW_TEMPLATES } from "../github-action-thin-callers/index.js";
import {
	REUSABLE_ACTIONS,
	REUSABLE_WORKFLOWS,
	reusableTemplates,
	WORKFLOW_TEMPLATE_PROPERTIES,
} from "./github-action-reusable-workflows.js";

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

	it("captures the holocron invocation's full output to a file, exposed as log-file (holocron#769/#794)", () => {
		const action = batch.get(".github/actions/holocron/action.yml")!;
		expect(action).toContain("outputs:");
		expect(action).toContain("log-file:");
		expect(action).toContain("value: ${{ steps.run.outputs.log-file }}");
		// tee, not just redirect — the live Actions log still streams normally
		expect(action).toContain('node "$cli" "$@" 2>&1 | tee "$log_file"');
		// PIPESTATUS[0], not $? -- $? after a pipe is tee's exit code (always 0),
		// which would silently mask a real task failure.
		expect(action).toContain("exit_code=${PIPESTATUS[0]}");
		expect(action).toContain('exit "$exit_code"');
	});

	it("platform.repoSync.yml runs `holocron repo sync` through the holocron action — not a hard-coded packages/cli path (holocron#655)", () => {
		const wf = REUSABLE_WORKFLOWS["platform.repoSync"]!;
		expect(wf).toContain("uses: theholocron/.github/.github/actions/holocron@main");
		expect(wf).toMatch(/command: repo sync/);
		expect(wf).not.toContain("node cli/cli/dist/cli.mjs");
		// the standalone `pnpm build` step is gone — the action handles it
		expect(wf).not.toMatch(/^\s+- run: pnpm build\n\s+name: Build CLI/m);
	});

	it("applies the do-not-edit header to YAML — no timestamp", () => {
		const typecheck = batch.get(".github/workflows/verification.typeSafety.yml")!;
		expect(typecheck.startsWith("# AUTO-GENERATED — do not edit in theholocron/.github directly.\n")).toBe(true);
		expect(typecheck).toContain(
			"# Source:  theholocron/holocron · cli/astromech/src/generators/github-action-reusable-workflows/github-action-reusable-workflows.ts"
		);
		expect(typecheck).toContain("# Tool:    holocron sync github");
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

	it("verification.unitTests.yml carries no Chromatic job or inputs (holocron#394/#1062)", () => {
		// GitHub evaluates a job's `if:` before expanding its `strategy.matrix`,
		// so no `chromatic-projects` default (empty or otherwise) can make a
		// *disabled* Chromatic job disappear from PR checks -- only not
		// generating the job at all does. Chromatic moved to its own task/
		// reusable workflow (verification.visualRegression) that a repo only
		// gets when it lists the task; verification.unitTests itself must
		// never regain a run-chromatic/chromatic-projects input or a
		// visual-and-composition job.
		const wf = REUSABLE_WORKFLOWS["verification.unitTests"]!;
		expect(wf).not.toContain("run-chromatic");
		expect(wf).not.toContain("chromatic-projects");
		expect(wf).not.toContain("visual-and-composition");
		expect(wf).not.toContain("chromaui/action");
	});

	it("verification.visualRegression.yml runs one matrix job per chromatic-projects entry, with no if: gate (holocron#394/#1062)", () => {
		const wf = REUSABLE_WORKFLOWS["verification.visualRegression"]!;
		expect(wf).toContain("chromaui/action");
		expect(wf).toMatch(/chromatic-projects:[\s\S]*?required: true/);
		expect(wf).not.toMatch(/visual-and-composition:\s*\n\s*if:/);
	});

	it("every Codecov upload fails its step when it fails, instead of passing silently (holocron#934)", () => {
		for (const name of ["verification.unitTests", "delivery.publish"] as const) {
			const uploads = REUSABLE_WORKFLOWS[name]!.split("- uses: codecov/codecov-action@").slice(1);
			expect(uploads.length).toBeGreaterThan(0);
			for (const step of uploads) {
				expect(step.split("\n\n")[0]!).toContain("fail_ci_if_error: true");
			}
		}
		// coverage + test results in the unit and Storybook jobs, the empty upload, plus the release-commit upload.
		// The per-flag upload is the codecov-upload action, not a codecov-action step, so it isn't counted here.
		expect(REUSABLE_WORKFLOWS["verification.unitTests"]!.split("- uses: codecov/codecov-action@")).toHaveLength(6);
		expect(REUSABLE_WORKFLOWS["delivery.publish"]!.split("- uses: codecov/codecov-action@")).toHaveLength(2);
	});

	it.each(["verification.unitTests", "verification.typeSafety", "delivery.build"] as const)(
		"%s takes an `affected` input that is off by default and fetches full history only when it is on",
		(name) => {
			const wf = REUSABLE_WORKFLOWS[name]!;
			expect(wf).toMatch(
				/affected:\s*\n\s*description:[^\n]*\n\s*type: boolean\n\s*required: false\n\s*default: false/
			);
			// a quoted '0': the number 0 is falsy in an expression, so `x && 0 || 1` is always 1
			expect(wf).toContain("fetch-depth: ${{ inputs.affected && '0' || '1' }}");
			expect(wf).toContain("affected: ${{ inputs.affected }}");
		}
	);

	it("verification.unitTests posts the Codecov statuses with an empty upload when an affected run wrote no report, and only then", () => {
		const wf = REUSABLE_WORKFLOWS["verification.unitTests"]!;
		const unit = wf.split("\n  storybook:\n")[0]!;
		expect(unit).toContain("run_command: empty-upload");
		expect(unit).toContain(
			"if: ${{ inputs.affected && (inputs.uploads == '' && steps.reports.outputs.coverage != 'true' || inputs.uploads != '' && steps.flags.outputs.uploaded == '0') }}"
		);
		// without `affected` an upload still runs unconditionally, so a missing report stays an error
		expect(unit).toContain(
			"if: ${{ inputs.uploads == '' && (!inputs.affected || steps.reports.outputs.coverage == 'true') }}"
		);
		expect(unit).toContain("(!inputs.affected || steps.reports.outputs.tests == 'true')");
	});

	it("setup keys the Turbo cache by workflow and job so every job saves its own entries", () => {
		const action = REUSABLE_ACTIONS["setup/action"]!;
		expect(action).toContain(
			"key: turbo-${{ runner.os }}-${{ github.workflow }}-${{ github.job }}-${{ github.sha }}"
		);
		// the same job's earlier commit comes first, any turbo cache last
		expect(action).toMatch(
			/restore-keys: \|\n\s+turbo-\$\{\{ runner\.os \}\}-\$\{\{ github\.workflow \}\}-\$\{\{ github\.job \}\}-\n\s+turbo-\$\{\{ runner\.os \}\}-\n/
		);
	});

	it("codecov-upload verifies the CLI, authenticates with the job's OIDC token and uploads one flag per entry", () => {
		const action = REUSABLE_ACTIONS["codecov-upload/action"]!;
		expect(action).toContain("gpg --verify codecov.SHA256SUM.sig codecov.SHA256SUM");
		expect(action).toContain("sha256sum -c codecov.SHA256SUM");
		expect(action).toContain("audience=https://codecov.io");
		expect(action).toContain('echo "::add-mask::$token"');
		expect(action).toContain('--flag "$flag"');
		expect(action).toContain("--fail-on-error");
		// the commit and report exist before the first flag uploads, as codecov-action does it
		expect(action.indexOf("create-commit")).toBeGreaterThan(-1);
		expect(action.indexOf("create-report")).toBeLessThan(action.indexOf("do-upload"));
		// nothing uploaded is an error unless the caller says an empty run is expected
		expect(action).toMatch(/uploaded" -eq 0 \] && \[ "\$ALLOW_EMPTY" != "true"/);
	});

	it("verification.unitTests uploads per flag only when `uploads` is set, and the old single upload otherwise", () => {
		const unit = REUSABLE_WORKFLOWS["verification.unitTests"]!.split("\n  storybook:\n")[0]!;
		expect(unit).toMatch(/uploads:\s*\n\s*description:[^\n]*\n\s*type: string\n\s*required: false\n\s*default: ""/);
		expect(unit).toContain("if: ${{ inputs.uploads != '' }}");
		expect(unit).toContain("uses: theholocron/.github/.github/actions/codecov-upload@main");
		expect(unit).toContain("allow-empty: ${{ inputs.affected }}");
		expect(unit).toContain(
			"if: ${{ inputs.uploads == '' && (!inputs.affected || steps.reports.outputs.coverage == 'true') }}"
		);
		// the empty upload follows whichever upload path ran
		expect(unit).toContain("inputs.uploads != '' && steps.flags.outputs.uploaded == '0'");
	});

	it("a failed Codecov upload fails the unit-test job, leaving 'required' to decide what blocks a merge (holocron#934)", () => {
		expect(REUSABLE_WORKFLOWS["verification.unitTests"]!).not.toContain("continue-on-error");
	});

	it("but a failed release-commit upload doesn't fail an already-published release or skip the Sentry steps (holocron#934)", () => {
		const step = REUSABLE_WORKFLOWS["delivery.publish"]!.split("- uses: codecov/codecov-action@")[1]!.split(
			"\n\n"
		)[0]!;
		expect(step).toContain("continue-on-error: true");
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

	it("delivery.publish.yml deploys from its own job, so VERCEL_TOKEN never reaches the release job (holocron#930)", () => {
		const wf = REUSABLE_WORKFLOWS["delivery.publish"]!;
		const [releaseJob, rest] = wf.split("\n  deploy:\n") as [string, string];
		const deployJob = rest.split("\n  sync-readme:")[0]!;

		// A separate job after the release, only when opted in and something published.
		expect(deployJob).toContain("needs: release");
		expect(deployJob).toContain("inputs.deploy-on-release == true");
		expect(deployJob).toContain("needs.release.outputs.commit != ''");
		expect(deployJob).toContain("inputs.dry-run != true");
		// It deploys the release commit, from the release job's outputs.
		expect(deployJob).toContain("ref: ${{ needs.release.outputs.commit }}");
		expect(deployJob).toContain("command: deploy on-release");
		for (const output of ["channel", "previous", "commit"]) {
			expect(deployJob).toContain(`needs.release.outputs.${output}`);
			expect(releaseJob).toContain(`${output}: \${{ steps.release.outputs.${output} }}`);
		}
		// Only the deploy job gets the token.
		expect(deployJob).toContain("VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}");
		expect(releaseJob.split("\n  deploy:")[0]).not.toContain("secrets.VERCEL_TOKEN");
	});

	it("delivery.previewCheck runs `holocron monitoring resolve-checks` then `monitoring run-resolved` with the preview URL input", () => {
		const previewCheck = REUSABLE_WORKFLOWS["delivery.previewCheck"]!;
		expect(previewCheck).toContain("workflow_call:");
		expect(previewCheck).toMatch(/preview-url:\s*\n\s*description:/);
		expect(previewCheck).toContain("command: monitoring resolve-checks");
		expect(previewCheck).toContain("command: monitoring run-resolved");
		expect(previewCheck).toContain(
			"args: --checks-file=${{ runner.temp }}/monitoring-checks.json --vercel-project=${{ inputs.vercel-project }} ${{ steps.validate.outputs.url }}"
		);
	});

	it("delivery.previewCheck validates the preview URL before forwarding it anywhere", () => {
		const previewCheck = REUSABLE_WORKFLOWS["delivery.previewCheck"]!;
		// Review on #1024: the triggering deployment_status event's
		// environment_url is attacker-influenceable (anyone with
		// `deployments: write` can set it), so it must be validated as an
		// https://*.vercel.app URL -- closing both an SSRF vector (fetching
		// an internal host) and argument injection (a string that fails to
		// parse can't carry embedded whitespace or shell metacharacters) --
		// before the monitoring-resolve-checks/run-resolved steps (which
		// forward steps.validate.outputs.url, never the raw input) ever run.
		expect(previewCheck).toMatch(/id: validate[\s\S]*hostname[\s\S]*\.vercel\.app/);
		expect(previewCheck.indexOf("id: validate")).toBeLessThan(
			previewCheck.indexOf("command: monitoring resolve-checks")
		);
		expect(previewCheck).not.toContain("args: --cwd=${{ inputs.cwd }} ${{ inputs.preview-url }}");
	});

	it("delivery.previewCheck declares VERCEL_TOKEN and VERCEL_PROTECTION_BYPASS_SECRET as optional", () => {
		const previewCheck = REUSABLE_WORKFLOWS["delivery.previewCheck"]!;
		// Review on #1030: Vercel's Deployment Protection (on by default for
		// Preview deployments) redirects an unauthenticated request to its
		// own SSO login before this job's own fetch ever reaches the app --
		// confirmed live. Both secrets are optional (required: false) since
		// a check against a non-Vercel URL, or one with protection
		// disabled, needs neither.
		expect(previewCheck).toMatch(/VERCEL_TOKEN:\s*\n\s*description:[\s\S]*?required: false/);
		expect(previewCheck).toMatch(/VERCEL_PROTECTION_BYPASS_SECRET:\s*\n\s*description:[\s\S]*?required: false/);
	});

	it("delivery.previewCheck splits config-loading from the credentialed request into separate steps (review on #1032)", () => {
		const previewCheck = REUSABLE_WORKFLOWS["delivery.previewCheck"]!;
		// `resolve-checks` loads and runs a PR's own holocron.config.ts --
		// untrusted. It must come first and must never see either secret,
		// or a malicious config could read and exfiltrate them before the
		// credentialed step ever runs.
		expect(previewCheck).toContain("command: monitoring resolve-checks");
		expect(previewCheck).toContain("command: monitoring run-resolved");
		const resolveIndex = previewCheck.indexOf("command: monitoring resolve-checks");
		const runResolvedIndex = previewCheck.indexOf("command: monitoring run-resolved");
		expect(resolveIndex).toBeGreaterThan(-1);
		expect(resolveIndex).toBeLessThan(runResolvedIndex);

		// The two commands live in separate steps -- each one's own `- name:`
		// block, sliced out independently, rather than trusting that
		// `resolveIndex`'s containing step happens not to mention the
		// secrets anywhere textually after it.
		const steps = previewCheck.split(/\n(?= {6}- )/);
		const resolveStep = steps.find((s) => s.includes("command: monitoring resolve-checks"));
		const runResolvedStep = steps.find((s) => s.includes("command: monitoring run-resolved"));
		expect(resolveStep).toBeDefined();
		expect(runResolvedStep).toBeDefined();

		// No `env:` key at all on the resolve step -- not just "doesn't
		// mention these two secrets by name" (which the step's own
		// explanatory comment legitimately does, to say why they're absent).
		expect(resolveStep).not.toMatch(/^\s+env:/m);
		// Gated on author trust (holocron#1057) -- see the dedicated test
		// for this below -- but still only ever read in this step, never
		// the resolve-checks one.
		expect(runResolvedStep).toContain("secrets.VERCEL_TOKEN");
		expect(runResolvedStep).toContain("secrets.VERCEL_PROTECTION_BYPASS_SECRET");
	});

	it("delivery.previewCheck never sets either secret job-wide — only within the run-resolved step's own env", () => {
		const previewCheck = REUSABLE_WORKFLOWS["delivery.previewCheck"]!;
		// A job-level `env:` block (immediately under runs-on/timeout-minutes,
		// before `steps:`) would hand both secrets to every step, including
		// the untrusted resolve-checks one -- the exact leak this split
		// exists to close (review on #1032). Sliced out and asserted
		// directly, rather than trusting step-level assertions elsewhere to
		// rule it out.
		const stepsIndex = previewCheck.indexOf("    steps:");
		const jobHeader = previewCheck.slice(previewCheck.indexOf("jobs:"), stepsIndex);
		expect(jobHeader).not.toContain("VERCEL_TOKEN");
		expect(jobHeader).not.toContain("VERCEL_PROTECTION_BYPASS_SECRET");
	});

	it("delivery.previewCheck verifies deployment ownership against vercel-project before attaching the bypass header", () => {
		const previewCheck = REUSABLE_WORKFLOWS["delivery.previewCheck"]!;
		// Review on #1032: a bare *.vercel.app hostname proves nothing on its
		// own -- anyone can register their own Vercel project. --vercel-project
		// is what `monitoring run-resolved` gates the bypass header on (see
		// packages/cli/src/commands/monitoring-run-resolved.ts); forwarding
		// it is what makes that gate reachable at all from this workflow.
		expect(previewCheck).toMatch(/vercel-project:\s*\n\s*description:/);
		// Not gated on author trust (sourcery review on #1058's first
		// attempt) -- it's the project id, not a secret. Clearing it for
		// an untrusted deployment would make resolveVercelBypassHeaders
		// treat "no project given" as trivially verified instead of
		// failing -- see the dedicated untrusted-path test below.
		expect(previewCheck).toContain("--vercel-project=${{ inputs.vercel-project }}");
	});

	it("delivery.previewCheck derives author trust itself, not from the attacker-controllable deployment payload (holocron#1057/#1058)", () => {
		const previewCheck = REUSABLE_WORKFLOWS["delivery.previewCheck"]!;
		// Sourcery review on #1056: confirmed live (runtime logs) that
		// Vercel forwards x-vercel-protection-bypass straight through to
		// the deployed function -- an untrusted PR's own code could read
		// and exfiltrate it off its own incoming request. Project-ownership
		// verification alone doesn't help, since the deployment
		// legitimately belongs to the protected project.
		//
		// First attempt (#1058) carried a value through the deployment's
		// `payload` field instead -- sourcery review caught that anyone
		// with `deployments: write` (the same precondition already needed
		// to create a deployment_status event at all) can set that field
		// to whatever they like on their own crafted deployment, forging
		// trust regardless of who actually authored the code. Fixed by
		// deriving trust here, from data this step verifies itself: which
		// real PR `inputs.sha` belongs to, then that PR's real author's
		// current push-access level.
		expect(previewCheck).not.toContain("github.event.deployment.payload");
		expect(previewCheck).toMatch(
			/id: trust[\s\S]*repos\/\$\{GITHUB_REPOSITORY\}\/commits\/\$\{SHA\}\/pulls[\s\S]*repos\/\$\{GITHUB_REPOSITORY\}\/collaborators\/\$\{author\}\/permission/
		);
		// Fail-closed: anything other than admin/maintain/write sets
		// trusted=false, including a missing/unrecognized permission --
		// and the wildcard arm itself is asserted explicitly, not just
		// the allowlisted one, so a mutation flipping it to `true` would
		// fail this test (sourcery review on #1058's first attempt).
		expect(previewCheck).toMatch(/admin \| maintain \| write\) trusted=true ;;/);
		expect(previewCheck).toMatch(/\*\) trusted=false ;;/);
		expect(previewCheck).toContain(
			"VERCEL_TOKEN: ${{ steps.trust.outputs.trusted == 'true' && secrets.VERCEL_TOKEN || '' }}"
		);
		expect(previewCheck).toContain(
			"VERCEL_PROTECTION_BYPASS_SECRET: ${{ steps.trust.outputs.trusted == 'true' && secrets.VERCEL_PROTECTION_BYPASS_SECRET || '' }}"
		);
		// The trust step must run before the step it gates.
		expect(previewCheck.indexOf("id: trust")).toBeLessThan(previewCheck.indexOf("id: resolve"));
	});

	it("delivery.previewCheck fails an untrusted deployment outright, rather than letting an unverified response report green (holocron#1058)", () => {
		const previewCheck = REUSABLE_WORKFLOWS["delivery.previewCheck"]!;
		// Sourcery review: the first attempt cleared --vercel-project
		// itself for an untrusted deployment, which made
		// resolveVercelBypassHeaders treat "no project given" as
		// trivially verified (its own early-return for an omitted
		// project) and still issue the real request with no bypass
		// header -- a check with no status-code assertion could pass on
		// Vercel's own 3xx protection redirect, reporting green without
		// ever reaching the app. vercel-project is never gated on trust
		// (it isn't a secret); only the two real secrets are, asserted in
		// the test above. Untrusted + a configured vercel-project then
		// means VERCEL_TOKEN is empty while vercel-project is not --
		// resolveVercelBypassHeaders's "project given but no token"
		// branch, which fails the check before any request is issued at
		// all (covered at the unit level by
		// monitoring-run-resolved.test.ts's "no Vercel token is
		// available" case) -- rather than a trust-gated project id that
		// would skip verification outright for an untrusted deployment.
		const runResolvedStep = previewCheck
			.split(/\n(?= {6}- )/)
			.find((s) => s.includes("command: monitoring run-resolved"))!;
		expect(runResolvedStep).not.toMatch(/vercel-project=\$\{\{[^}]*trust[^}]*\}\}/);
	});

	it("delivery.previewCheck checks out the deployed commit explicitly, not the default branch", () => {
		const previewCheck = REUSABLE_WORKFLOWS["delivery.previewCheck"]!;
		expect(previewCheck).toMatch(/sha:\s*\n\s*description:/);
		expect(previewCheck).toMatch(
			/actions\/checkout@[^\n]+\n\s+name: Checkout repository\n\s+with:\n\s+ref: \$\{\{ inputs\.sha \}\}/
		);
	});

	it("delivery.previewCheck's cwd input defaults to the repo root for a single-package repo", () => {
		const previewCheck = REUSABLE_WORKFLOWS["delivery.previewCheck"]!;
		expect(previewCheck).toMatch(
			/cwd:\s*\n\s*description:[^\n]*\n\s*required: false\n\s*type: string\n\s*default: "\."/
		);
	});

	it("delivery.previewDeploy never carries trust data through the deployment payload (holocron#1058 follow-up)", () => {
		const previewDeploy = REUSABLE_WORKFLOWS["delivery.previewDeploy"]!;
		// A deployment's `payload` field is attacker-controllable by
		// anyone with `deployments: write` -- the same precondition
		// already needed to create a deployment_status event at all --
		// so a value carried through it (sourcery review on #1058's
		// first attempt: payload.author_association, later
		// payload.collaborator_permission) could be forged on a crafted
		// deployment regardless of who actually authored the code.
		// delivery.previewCheck now derives trust itself instead (see
		// its own dedicated test) -- this deployment's payload carries
		// nothing for it to trust.
		expect(previewDeploy).not.toContain("payload:");
		expect(previewDeploy).not.toContain("author_association");
		expect(previewDeploy).not.toContain("collaborator_permission");
	});

	it("delivery.previewDeploy leaves a visible notice when a fork PR has no deploy credentials (holocron#1027)", () => {
		const previewDeploy = REUSABLE_WORKFLOWS["delivery.previewDeploy"]!;
		// Matched as the actual if/then/else/fi structure, not two
		// independent substring checks -- those would each still pass
		// (false green) if the notice moved into the token-present
		// branch, or outside the branch entirely (holocron#1027 review).
		const credsBlock = previewDeploy.match(
			/if \[ -n "\$VERCEL_TOKEN" \]; then\n([\s\S]*?)\n\s*else\n([\s\S]*?)\n\s*fi/
		);
		expect(credsBlock).not.toBeNull();
		const [, tokenPresentBody, tokenMissingBody] = credsBlock!;
		// A log annotation, not an API write (checks/comments) -- the only
		// thing available from this step: a fork-triggered pull_request
		// run never gets a write-scoped token, regardless of permissions:,
		// so there's no way to post either from here.
		expect(tokenMissingBody).toContain('echo "::notice title=No preview deployed::');
		// Never fires, and so never adds noise, for an ordinary same-repo
		// PR that has the secret.
		expect(tokenPresentBody).not.toContain("::notice");
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
		expect(REUSABLE_WORKFLOWS["platform.repoValidation"]).not.toContain("job: registry");
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
		expect(wf).toContain('gh api --method PATCH "/repos/${REPO}/check-runs/${CHECK_RUN_ID}" --input -');
		expect(wf).toContain("CONCLUSION: ${{ steps.run-task.outcome == 'success' && 'success' || 'failure' }}");
	});

	it("points details_url at the specific job's log view, not just the run summary", () => {
		expect(wf).toContain("id: job-info");
		expect(wf).toContain(".jobs[0].id");
		expect(wf).toContain(
			"RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}/job/${{ steps.job-info.outputs.job_id }}"
		);
	});

	it("ships the task's real captured output to Axiom, tagged with this check run's own id", () => {
		expect(wf).toContain("id: axiom");
		expect(wf).toContain("LOG_FILE: ${{ steps.run-task.outputs.log-file }}");
		expect(wf).toContain("https://api.axiom.co/v1/datasets/${AXIOM_DATASET}/ingest");
		expect(wf).toContain("check_run_id: $check_run_id");
		expect(wf).toContain("AXIOM_TOKEN: ${{ secrets.SENTINEL_AXIOM_INGEST_TOKEN }}");
		// ingest failing must never break the actual check-run report
		expect(wf).toMatch(/curl[\s\S]*\|\|\s*echo "::warning::Axiom ingest failed/);
	});

	it("builds an Axiom permalink filtered to this run's own logs, not a bare dataset view", () => {
		expect(wf).toContain("query-url=https://app.axiom.co/${AXIOM_ORG}/query?initForm=${encoded}");
		expect(wf).toContain('where check_run_id == \\"${CHECK_RUN_ID}\\"');
	});

	it("tags the shipped event with a level field so Axiom's severity highlighting applies", () => {
		expect(wf).toContain('level=$([ "$CONCLUSION" = "success" ] && echo "info" || echo "error")');
		expect(wf).toContain("level: $level");
	});

	it("embeds the real log excerpt and the Axiom link directly in output.text, not just a bare link", () => {
		expect(wf).toContain("QUERY_URL: ${{ steps.axiom.outputs.query-url }}");
		expect(wf).toContain("[Full logs on Axiom](%s)");
		expect(wf).toContain('tail -c 3000 "$LOG_FILE"');
		expect(wf).toContain("output: {title: $title, summary: $summary, text: $text}");
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

describe("REUSABLE_WORKFLOWS['platform.notifyCheck'] — the end-to-end notification check", () => {
	const wf = REUSABLE_WORKFLOWS["platform.notifyCheck"]!;

	it("is registered and reusable", () => {
		expect(wf).toMatch(/^name: Notify Check/);
		expect(wf).toContain("workflow_call:");
	});

	it("lists the default channels as objects that name their own secret, with only alerts marked to ping", () => {
		const folded = /default: >-\n([\s\S]*?)\n {4}secrets:/.exec(wf)![1]!.replace(/\s*\n\s*/g, " ");
		const channels = JSON.parse(folded) as Array<{ name: string; secret: string; mention?: boolean }>;
		expect(channels.map((c) => c.name)).toEqual(["sync", "alerts", "errors", "uptime", "releases", "deploys"]);
		for (const c of channels) expect(c.secret).toBe(`HOLOCRON_NOTIFY_WEBHOOK_${c.name.toUpperCase()}`);
		expect(channels.filter((c) => c.mention).map((c) => c.name)).toEqual(["alerts"]);
	});

	it("declares every default channel's webhook secret plus the role secret, for callers that pass secrets explicitly", () => {
		for (const channel of ["SYNC", "ALERTS", "ERRORS", "UPTIME", "RELEASES", "DEPLOYS"]) {
			expect(wf).toContain(`HOLOCRON_NOTIFY_WEBHOOK_${channel}:`);
		}
		expect(wf).toContain("HOLOCRON_NOTIFY_ALERT_ROLE:");
	});

	it("posts to each channel with the strict notify action, so one bad channel fails its own job and not the others", () => {
		expect(wf).toContain("fail-fast: false");
		expect(wf).toContain("theholocron/.github/.github/actions/notify@main");
		expect(wf).toContain('strict: "true"');
		expect(wf).toContain("fromJSON(inputs.channels)");
	});

	it("reads each channel's webhook from the secret the channel names, not one derived from its name", () => {
		expect(wf).toContain("webhook: ${{ secrets[matrix.channel.secret] }}");
		expect(wf).not.toContain("format('HOLOCRON_NOTIFY_WEBHOOK_");
	});

	it("pings the role only on channels marked mention, and requires the role id there instead of passing quietly", () => {
		expect(wf).toMatch(/mention: \$\{\{ matrix\.channel\.mention && secrets\.HOLOCRON_NOTIFY_ALERT_ROLE/);
		expect(wf).toContain("name: Require the alert role id");
		expect(wf).toContain("if: matrix.channel.mention");
		expect(wf).toContain("HOLOCRON_NOTIFY_ALERT_ROLE is not set");
	});

	it("runs with no token permissions", () => {
		expect(wf).toContain("permissions: {}");
	});
});

describe("REUSABLE_WORKFLOWS['platform.repoSync'] — the role id comes from a secret", () => {
	it("mentions the role through secrets, not variables, and declares the secret", () => {
		const wf = REUSABLE_WORKFLOWS["platform.repoSync"]!;
		expect(wf).toContain("HOLOCRON_NOTIFY_ALERT_ROLE:");
		expect(wf).toContain("mention: ${{ secrets.HOLOCRON_NOTIFY_ALERT_ROLE }}");
		expect(wf).not.toContain("vars.HOLOCRON_NOTIFY_ALERT_ROLE");
	});
});

describe("delivery.publish.yml version groups", () => {
	const wf = REUSABLE_WORKFLOWS["delivery.publish"]!;

	it("takes an optional `group` string input, empty by default", () => {
		expect(wf).toMatch(/\n {6}group:\n(?: {8}.*\n)*? {8}type: string\n {8}required: false\n {8}default: ""\n/);
	});

	it("hands the group to the release config as RELEASE_GROUP", () => {
		expect(wf).toContain("RELEASE_GROUP: ${{ inputs.group }}");
	});

	it("releases a group from the branch's current tip, and an ungrouped repo from the triggering commit", () => {
		expect(wf).toContain("ref: ${{ (inputs.group != '' || inputs.from-branch-tip) && github.ref || github.sha }}");
	});

	it("lets an ungrouped release start from the branch's tip too, off by default, for when the groups ran first", () => {
		expect(wf).toMatch(
			/\n {6}from-branch-tip:\n(?: {8}.*\n)*? {8}type: boolean\n {8}required: false\n {8}default: false\n/
		);
	});

	it("scopes every tag lookup to the group's `<group>-v*` tags, not just the release step's", () => {
		expect(wf).not.toMatch(/git describe --tags --abbrev=0(?! "\$\{MATCH\[@\]\}")/);
		expect(wf.match(/MATCH=\(--match "\$\{RELEASE_GROUP\}-v\*"\)/g)).toHaveLength(2);
	});

	describe("the release step's shell", () => {
		/** The Release step's script, with `npx semantic-release` standing in as a commit and a tag. */
		function runReleaseStep(group: string, tags: Record<string, string>, newTag: string) {
			const start = wf.indexOf("      - name: Release\n        id: release\n        run: |\n");
			const lines = wf.slice(start).split("        run: |\n")[1]!.split("\n");
			const end = lines.findIndex((line) => line !== "" && !line.startsWith("          "));
			const script = lines
				.slice(0, end)
				.map((line) => line.slice(10))
				.join("\n");
			const repo = mkdtempSync(join(tmpdir(), "astromech-release-step-"));
			const out = join(repo, "..", `${repo.split("/").pop()}.out`);
			writeFileSync(out, "");
			const git = (...args: string[]) =>
				execFileSync(
					"git",
					["-c", "core.hooksPath=/dev/null", "-c", "user.email=t@t", "-c", "user.name=t", ...args],
					{
						cwd: repo,
						encoding: "utf8",
						env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
					}
				).trim();
			git("init", "-q");
			const commits: Record<string, string> = {};
			for (const [name, tag] of Object.entries(tags)) {
				writeFileSync(join(repo, `${name}.txt`), name);
				git("add", "-A");
				git("commit", "-q", "-m", `feat: ${name}`);
				git("tag", tag);
				commits[tag] = git("rev-parse", "HEAD");
			}
			mkdirSync(join(repo, "x"), { recursive: true });
			const shim = `npx() { git -c core.hooksPath=/dev/null -c user.email=t@t -c user.name=t commit -q --allow-empty -m release; git tag ${newTag}; }\n`;
			const result = spawnSync("bash", ["-c", `set -eo pipefail\n${shim}${script}`], {
				cwd: repo,
				encoding: "utf8",
				env: {
					...process.env,
					GIT_CONFIG_GLOBAL: "/dev/null",
					GIT_CONFIG_SYSTEM: "/dev/null",
					GITHUB_OUTPUT: out,
					DRY_RUN: "false",
					RELEASE_GROUP: group,
				},
			});
			if (result.status !== 0) throw new Error(`release step exited ${result.status}: ${result.stderr}`);
			const outputs = Object.fromEntries(
				readFileSync(out, "utf8")
					.split("\n")
					.filter(Boolean)
					.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])
			);
			return { outputs, commits };
		}

		it("takes `previous` from the group's own last tag, not the nearest tag of another group", () => {
			// utils is tagged after clients, so a bare `git describe` from the release commit finds utils
			const { outputs, commits } = runReleaseStep(
				"clients",
				{ a: "clients-v1.0.0", b: "utils-v2.0.0" },
				"clients-v1.1.0"
			);
			expect(outputs["previous"]).toBe(commits["clients-v1.0.0"]);
			expect(outputs["commit"]).toMatch(/^[0-9a-f]{40}$/);
			expect(outputs["channel"]).toBe("");
		});

		it("reads the channel of a group's prerelease tag past the group prefix", () => {
			const { outputs } = runReleaseStep("cli", { a: "cli-v5.0.0-alpha.1" }, "cli-v5.0.0-alpha.2");
			expect(outputs["channel"]).toBe("alpha");
		});

		it("keeps the ungrouped behavior: the nearest tag, `v` stripped for the channel", () => {
			const { outputs, commits } = runReleaseStep("", { a: "v1.0.0", b: "v1.1.0" }, "v1.2.0-alpha.1");
			expect(outputs["previous"]).toBe(commits["v1.1.0"]);
			expect(outputs["channel"]).toBe("alpha");
		});
	});
});
