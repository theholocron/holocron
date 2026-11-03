/**
 * The old dotted task names and the flat ids that replace them, from the "Old to new" map in
 * `.notes/ci-flat-task-vocabulary.spec.md` (SPEC-0064). `holocron probe tasks names` takes it as data, so once the
 * astromech registry carries `LEGACY_NAMES` (#1615) this table is replaced by a read of that one.
 *
 * Only the dotted spellings are listed: a bare old name (`review`, `stale`, `dependencies`) is an ordinary word and
 * would match prose. A task that splits in two (`sourceQuality.formatting`, `platform.repoValidation`) names both ids.
 */
export const LEGACY_TASK_NAMES: Readonly<Record<string, string>> = {
	"verification.unitTests": "test:unit",
	"verification.visualRegression": "test:visual",
	"verification.performance": "test:perf",
	"verification.typeSafety": "typecheck",
	"sourceQuality.staticAnalysis": "lint:code",
	"sourceQuality.formatting": "lint:editorconfig, lint:markdown (format for prettier)",
	"sourceQuality.structuredDataValidation": "lint:data",
	"sourceQuality.deadCodeAnalysis": "lint:unused",
	"sourceQuality.dependencyCatalogs": "validate:deps",
	"sourceQuality.generatedFiles": "validate:generated",
	"sourceQuality.docsCoverage": "validate:api-docs",
	"platform.commitStandards": "lint:commits",
	"security.secretDetection": "scan:secrets",
	"security.codeScanning": "scan:code",
	"security.tokenExpiry": "check-tokens",
	"delivery.build": "build",
	"delivery.bundleSize": "measure-bundle",
	"delivery.publish": "release",
	"delivery.deploy": "deploy",
	"delivery.previewDeploy": "deploy-preview",
	"delivery.previewCheck": "check-preview",
	"platform.repoValidation": "validate:specs, validate:docs",
	"platform.repoSync": "sync-repo",
	"platform.syncTemplates": "sync-templates",
	"platform.notifyCheck": "check-notify",
	"platform.dispatchedCheck": "check-dispatched",
	"platform.notifications": "notify",
	"platform.doctorReminder": "remind-doctor",
	"knowledge.wiki": "publish-wiki",
	"knowledge.docs": "deploy-docs",
	"knowledge.components": "deploy-components",
	"knowledge.specsToIdeas": "sync-specs",
	"sentinel.deploy": "deploy-sentinel",
	"sentinel.secretsSync": "sync-sentinel-secrets",
};
