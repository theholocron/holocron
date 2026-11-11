import type { LegacyTarget } from "./legacy-names.type.js";

/**
 * The old dotted task names (and the workflow-only keys) and the flat ids they became — the complete map of spec
 * `ci-flat-task-vocabulary`, "Old to new". `holocron run <old>` and `tasks:` in `holocron.config` still accept them
 * for a window (the frozen reusables in `theholocron/.github` run `holocron run <old>` until #1216 deletes them), and
 * a name that stood for one workflow carrying several checks maps to all of its successors, in run order.
 *
 * Each key is also the name of the generated workflow file, the turbo task and the `package.json` script until the
 * later phases move those, so {@link legacyName} reads this table backwards. Removed together with the aliases in the
 * last phase.
 */
export const LEGACY_NAMES: Record<string, LegacyTarget[]> = {
	"verification.unitTests": [{ id: "test:unit" }],
	"verification.visualRegression": [{ id: "test:visual" }],
	"verification.performance": [{ id: "test:perf" }],
	"verification.typeSafety": [{ id: "typecheck" }],
	"sourceQuality.staticAnalysis": [{ id: "lint:code" }],
	// Prettier checked, editorconfig-checker and markdownlint reported: one workflow, three successors. The frozen
	// reusable runs this name, so it keeps all three; a new workflow is one each (`lint:editorconfig`, `lint:markdown`,
	// and `format` inside `lint:code`).
	"sourceQuality.formatting": [
		{ id: "lint:editorconfig" },
		{ id: "lint:markdown" },
		{ id: "format", passthrough: ["--check"] },
	],
	"sourceQuality.structuredDataValidation": [{ id: "lint:data" }],
	"sourceQuality.deadCodeAnalysis": [{ id: "lint:unused" }],
	"platform.commitStandards": [{ id: "lint:commits" }],
	"security.secretDetection": [{ id: "scan:secrets" }],
	"security.codeScanning": [{ id: "scan:code" }],
	"security.tokenExpiry": [{ id: "check-tokens" }],
	"delivery.build": [{ id: "build" }],
	// `measure-docs` and `measure-bundle` were the hyphen ids before `measure` became a suite (#2070). Like `validate`
	// below they stay accepted with the deprecation notice and name the same generated files (`measure-docs.yml`).
	// `measure-bundle` is listed before `delivery.bundleSize` because the reverse lookups keep the last name that lists an
	// id, and the dotted name is the older spelling a repo may still have.
	"measure-docs": [{ id: "measure:docs" }],
	"measure-bundle": [{ id: "measure:bundle" }],
	"delivery.bundleSize": [{ id: "measure:bundle" }],
	"delivery.publish": [{ id: "release" }],
	"delivery.deploy": [{ id: "deploy" }],
	"delivery.previewDeploy": [{ id: "deploy-preview" }],
	"delivery.previewCheck": [{ id: "check-preview" }],
	// `validate` was the interim id of one task with the jobs `adrs` and `docsPresence`; it is now the suite of
	// `validate:specs` and `validate:docs` (spec phase J), so both names stand for both leaves. `validate` is listed
	// first because the reverse lookups (`legacyName`, `legacyFile`) keep the last name that lists an id, and the old
	// workflow and file were `platform.repoValidation`. Each leaf has a reusable workflow of its own; the frozen
	// `platform.repoValidation.yml` in `theholocron/.github` ran both (see `legacyWorkflowKey`).
	validate: [{ id: "validate:specs" }, { id: "validate:docs" }],
	"platform.repoValidation": [{ id: "validate:specs" }, { id: "validate:docs" }],
	"platform.repoSync": [{ id: "sync-repo" }],
	"platform.syncTemplates": [{ id: "sync-templates" }],
	"platform.notifyCheck": [{ id: "check-notify" }],
	"platform.dispatchedCheck": [{ id: "check-dispatched" }],
	"knowledge.wiki": [{ id: "publish-wiki" }],
	"knowledge.docs": [{ id: "deploy-docs" }],
	"knowledge.components": [{ id: "deploy-components" }],
	bookkeeping: [{ id: "label" }],
	greetings: [{ id: "greet" }],
	stale: [{ id: "mark-stale" }],
	dependencies: [{ id: "update-deps" }],
	review: [{ id: "annotate" }],
};
