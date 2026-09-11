import { describe, expect, it } from "vitest";

import { REUSABLE_ACTIONS, REUSABLE_WORKFLOWS, reusableTemplates, WORKFLOW_TEMPLATE_PROPERTIES } from "./reusable.js";
import { baselineSuperLinterEnv } from "./super-linter.js";
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
	});

	it("applies the do-not-edit header to YAML — no timestamp", () => {
		const lint = batch.get(".github/workflows/lint.yml")!;
		expect(lint.startsWith("# AUTO-GENERATED — do not edit in theholocron/.github directly.\n")).toBe(true);
		expect(lint).toContain("# Source:  theholocron/holocron · packages/astromech/src/reusable.ts");
		expect(lint).toContain("# Tool:    holocron sync-github");
		// A live `Synced:` timestamp would defeat sync-github's unchanged-file skip.
		expect(lint).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
		expect(lint).not.toContain("Synced:");
		// header, then the real workflow
		expect(lint).toContain("\nname: Lint\n");
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
	it("typecheck.yml runs the typecheck task through the holocron action", () => {
		const wf = REUSABLE_WORKFLOWS["typecheck"]!;
		expect(wf).toContain("uses: theholocron/.github/.github/actions/holocron@main");
		expect(wf).toMatch(/task: typecheck/);
		expect(wf).not.toContain("run: pnpm typecheck");
	});

	it("test.yml unit job runs the test task through the holocron action", () => {
		const wf = REUSABLE_WORKFLOWS["test"]!;
		expect(wf).toContain("uses: theholocron/.github/.github/actions/holocron@main");
		expect(wf).toMatch(/task: test/);
		expect(wf).not.toContain("run: pnpm test:coverage");
	});

	it("release.yml uploads coverage for the [skip ci] release commit (holocron#644)", () => {
		const wf = REUSABLE_WORKFLOWS["release"]!;
		// detect the release commit semantic-release just pushed
		expect(wf).toMatch(/BEFORE=\$\(git rev-parse HEAD\)/);
		expect(wf).toMatch(/echo "commit=\$AFTER" >> "\$GITHUB_OUTPUT"/);
		// run tests + upload, keyed to that SHA so the next PR compares cleanly
		expect(wf).toMatch(/if: \$\{\{ steps\.release\.outputs\.commit != '' \}\}/);
		expect(wf).toContain("override_commit: ${{ steps.release.outputs.commit }}");
		expect(wf).toContain("codecov/codecov-action@");
	});

	it("audit.yml runs build / audit knip / audit performance through the holocron action", () => {
		const wf = REUSABLE_WORKFLOWS["audit"]!;
		expect(wf).not.toContain('eval "$KNIP_SCRIPT"');
		expect(wf).not.toContain('eval "$BUILD_SCRIPT"');
		expect(wf).not.toContain("run: lhci autorun");
		// the build-script / knip-script inputs are gone — the command comes from
		// the manifest, and no caller passed them
		expect(wf).not.toMatch(/^\s+build-script:/m);
		expect(wf).not.toMatch(/^\s+knip-script:/m);
		expect(wf).toMatch(/task: build/);
		expect(wf).toMatch(/task: audit\n\s+job: knip/);
		expect(wf).toMatch(/task: audit\n\s+job: performance\n\s+args: --config=/);
		// the bundle-stats uploader still gets its token, at the job level now
		expect(wf).toContain("CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}");
		expect(wf).toContain("LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}");
	});
});

describe("REUSABLE_WORKFLOWS.wiki — preview deployment widget", () => {
	const wiki = REUSABLE_WORKFLOWS["wiki"]!;

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

describe("REUSABLE_WORKFLOWS.lint — super-linter-env", () => {
	const lint = REUSABLE_WORKFLOWS["lint"]!;

	it("declares the super-linter-env input and expands it, not file detection", () => {
		expect(lint).toMatch(/^ {6}super-linter-env:$/m);
		expect(lint).toContain("Expand linter matrix");
		expect(lint).not.toContain("Detect project features");
	});

	it("no longer hard-codes the always-on VALIDATE_* block in the super-linter step", () => {
		const superLinterEnv = lint.slice(lint.indexOf("Run Super Linter"));
		expect(superLinterEnv).not.toContain("# Always-on linters");
	});

	it("the input default is the astromech always-on baseline", () => {
		const raw = lint.match(/super-linter-env:[\s\S]*?default: >-\n([\s\S]*?)\n {4}secrets:/)?.[1];
		expect(raw).toBeDefined();
		const parsed = JSON.parse(raw!.replace(/\n\s+/g, "")) as Record<string, string>;
		expect(Object.keys(parsed).sort()).toEqual(Object.keys(baselineSuperLinterEnv()).sort());
		expect(Object.values(parsed).every((v) => v === "true")).toBe(true);
	});
});
