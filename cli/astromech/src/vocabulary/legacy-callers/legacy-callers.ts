import type { LegacyCaller } from "./legacy-callers.type.js";

/**
 * What each thin caller was called before the workflow, job and file names became the task id: the workflow `name:`,
 * and the id and `name:` of each job by the id the job has now (the file basename, `workflowFile(id)` without `.yml`).
 * A repo whose callers still point at the frozen reusables in `theholocron/.github` keeps these names, because its
 * ruleset lists the checks they post (`<caller job name> / <called job name>`); see `legacyCaller`. Dropped with the
 * gate when `CI_HOME` moves to `ci-v1`.
 */
export const LEGACY_CALLERS: Record<string, LegacyCaller> = {
	annotate: {
		name: "Source Quality",
		jobs: {
			annotate: { id: "review", name: "Annotations" },
		},
	},
	build: {
		name: "Delivery",
		jobs: {
			build: { id: "build", name: "Build" },
		},
	},
	"check-notify": {
		name: "Platform",
		jobs: {
			"check-notify": { id: "notify-check", name: "Notify Check" },
		},
	},
	"check-preview": {
		name: "Delivery",
		jobs: {
			"check-preview": { id: "preview-check", name: "Preview Check" },
		},
	},
	"check-tokens": {
		name: "Token Expiry",
		jobs: {
			"check-tokens": { id: "token-expiry", name: "Token Expiry" },
		},
	},
	"doctor-tokens": {
		name: "Doctor Tokens",
		jobs: {
			"doctor-tokens": { id: "doctor-tokens", name: "Doctor Tokens" },
		},
	},
	"deploy-preview": {
		name: "Delivery",
		jobs: {
			"deploy-preview": { id: "preview-deploy", name: "Preview Deploy" },
		},
	},
	deploy: {
		name: "Delivery",
		combinedName: "Deploy",
		jobs: {
			deploy: { id: "deploy", name: "Deploy" },
			"deploy-preview": { id: "preview", name: "Preview" },
		},
	},
	greet: {
		name: "Platform",
		jobs: {
			greet: { id: "greetings", name: "Greetings" },
		},
	},
	label: {
		name: "Platform",
		jobs: {
			label: { id: "bookkeeping", name: "Bookkeeping" },
		},
	},
	"lint:code": {
		name: "Source Quality",
		jobs: {
			"lint-code": { id: "static-analysis", name: "Static Analysis" },
		},
	},
	"lint:commits": {
		name: "Platform",
		jobs: {
			"lint-commits": { id: "commit-standards", name: "Commit Standards" },
		},
	},
	"lint:data": {
		name: "Source Quality",
		jobs: {
			"lint-data": { id: "structured-data-validation", name: "Structured Data Validation" },
		},
	},
	"lint:editorconfig": {
		name: "Source Quality",
		jobs: {
			"lint-editorconfig": { id: "formatting", name: "Formatting" },
		},
	},
	// Never written as a file: a repo on the legacy gate gets the `lint:editorconfig` caller for it (`legacyWorkflowKey`).
	// The entry names the check the old formatting workflow posted, which this one replaced.
	"lint:markdown": {
		name: "Source Quality",
		jobs: {
			"lint-markdown": { id: "formatting", name: "Formatting" },
		},
	},
	"lint:unused": {
		name: "Source Quality",
		jobs: {
			"lint-unused": { id: "dead-code-analysis", name: "Dead Code Analysis" },
		},
	},
	"mark-stale": {
		name: "Stale",
		jobs: {
			"mark-stale": { id: "stale" },
		},
	},
	"measure:bundle": {
		name: "Delivery",
		jobs: {
			"measure-bundle": { id: "bundle-size", name: "Audit the Bundle Size" },
		},
	},
	preview: {
		name: "Preview",
		jobs: {
			preview: { id: "preview", name: "Preview" },
		},
	},
	"measure:docs": {
		name: "Source Quality",
		jobs: {
			"measure-docs": { id: "docs-coverage", name: "Docs coverage" },
		},
	},
	"publish-wiki": {
		name: "Knowledge",
		jobs: {
			"publish-wiki": { id: "publish", name: "Publish" },
			"publish-wiki-preview": { id: "preview", name: "Preview" },
		},
	},
	"remind-doctor": {
		name: "Platform",
		jobs: {
			"remind-doctor": { id: "doctor-reminder", name: "Doctor reminder" },
		},
	},
	"reconcile-projects": {
		name: "Platform",
		jobs: {
			"reconcile-projects": { id: "reconcile-projects", name: "Reconcile Projects" },
		},
	},
	release: {
		name: "Delivery",
		jobs: {
			release: { id: "release", name: "Release" },
		},
		replace: { "name: release ${{ matrix.group }}": "name: Release ${{ matrix.group }}" },
	},
	"scan:code": {
		name: "Security",
		jobs: {
			"scan-code": { id: "security", name: "Code Scanning" },
		},
	},
	"scan:secrets": {
		name: "Security",
		jobs: {
			"scan-secrets": { id: "secret-detection", name: "Secret Detection" },
		},
	},
	"sync-repo": {
		name: "Platform",
		jobs: {
			"sync-repo": { id: "sync", name: "Sync" },
		},
	},
	"deploy-sentinel": {
		name: "Sentinel Deploy",
		jobs: {
			"deploy-sentinel": { id: "deploy", name: "Deploy" },
		},
	},
	"sync-secrets": {
		name: "Sentinel Secrets Sync",
		jobs: {
			"sync-secrets": { id: "sync", name: "Sync" },
		},
	},
	"sync-specs": {
		name: "Spec discussions",
		jobs: {
			"sync-specs": { id: "sync", name: "Sync" },
		},
	},
	"preview-specs": {
		name: "Spec discussions (pull request)",
		jobs: {
			"preview-specs": { id: "sync", name: "Sync" },
		},
	},
	"sync-templates": {
		name: "Platform",
		jobs: {
			"sync-templates": { id: "sync-templates", name: "Sync Templates" },
		},
	},
	"test:perf": {
		name: "Verification",
		jobs: {
			"test-perf": { id: "performance", name: "Audit the Performance" },
		},
	},
	"test:unit": {
		name: "Verification",
		jobs: {
			"test-unit": { id: "test", name: "Test" },
		},
	},
	"test:visual": {
		name: "Visual Regression",
		jobs: {
			"test-visual": { id: "visual-and-composition", name: "Visual Regression" },
		},
	},
	typecheck: {
		name: "Verification",
		jobs: {
			typecheck: { id: "typecheck", name: "Typecheck" },
		},
	},
	"update-deps": {
		name: "Platform",
		jobs: {
			"update-deps": { id: "dependencies", name: "Dependencies" },
		},
	},
	// The frozen `platform.repoValidation.yml` ran both leaves in one workflow, so while callers are legacy-named only the
	// first successor of `validate`, `validate:specs`, gets a caller (the generators skip the rest); `validate:docs` keeps
	// the entry so that every template has one.
	"validate:specs": {
		name: "Platform",
		jobs: {
			"validate-specs": { id: "repo-validation", name: "Repo Validation" },
		},
	},
	"validate:docs": {
		name: "Platform",
		jobs: {
			"validate-docs": { id: "repo-validation", name: "Repo Validation" },
		},
	},
	"validate:deps": {
		name: "Source Quality",
		jobs: {
			"validate-deps": { id: "dependency-catalogs", name: "Dependency catalogs" },
		},
	},
	"validate:generated": {
		name: "Source Quality",
		jobs: {
			"validate-generated": { id: "generated-files", name: "Generated files" },
		},
	},
	"deploy-docs": {
		name: "Deploy",
		jobs: {
			"deploy-docs": { id: "deploy", name: "Deploy" },
			"deploy-docs-preview": { id: "preview", name: "Preview" },
		},
	},
	"deploy-components": {
		name: "Deploy",
		jobs: {
			"deploy-components": { id: "deploy", name: "Deploy" },
			"deploy-components-preview": { id: "preview", name: "Preview" },
		},
	},
};
