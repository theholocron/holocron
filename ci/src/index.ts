/**
 * The reusable workflows and composite actions every repo of the org calls, as text. The files are written once, here;
 * `@theholocron/astromech` reads them to generate what `holocron sync github` pushes, and the `ci` version group
 * (spec `tech-workflows-in-holocron`, issue #1480) versions and tags this folder.
 */
import autoCommitAction from "../actions/auto-commit/action.yml";
import codecovUploadAction from "../actions/codecov-upload/action.yml";
import holocronAction from "../actions/holocron/action.yml";
import installAction from "../actions/install/action.yml";
import notifyAction from "../actions/notify/action.yml";
import setupAction from "../actions/setup/action.yml";
import setupNodeAction from "../actions/setup-node/action.yml";
import bookkeepingWorkflow from "../workflows/bookkeeping.yml";
import buildWorkflow from "../workflows/delivery.build.yml";
import bundleSizeWorkflow from "../workflows/delivery.bundleSize.yml";
import deployWorkflow from "../workflows/delivery.deploy.yml";
import previewCheckWorkflow from "../workflows/delivery.previewCheck.yml";
import previewDeployWorkflow from "../workflows/delivery.previewDeploy.yml";
import publishWorkflow from "../workflows/delivery.publish.yml";
import dependenciesWorkflow from "../workflows/dependencies.yml";
import greetingsWorkflow from "../workflows/greetings.yml";
import wikiWorkflow from "../workflows/knowledge.wiki.yml";
import commitStandardsWorkflow from "../workflows/platform.commitStandards.yml";
import dispatchedCheckWorkflow from "../workflows/platform.dispatchedCheck.yml";
import notifyCheckWorkflow from "../workflows/platform.notifyCheck.yml";
import repoSyncWorkflow from "../workflows/platform.repoSync.yml";
import repoValidationWorkflow from "../workflows/platform.repoValidation.yml";
import syncTemplatesWorkflow from "../workflows/platform.syncTemplates.yml";
import previewWorkflow from "../workflows/preview.yml";
import reviewWorkflow from "../workflows/review.yml";
import codeScanningWorkflow from "../workflows/security.codeScanning.yml";
import secretDetectionWorkflow from "../workflows/security.secretDetection.yml";
import tokenExpiryWorkflow from "../workflows/security.tokenExpiry.yml";
import deadCodeAnalysisWorkflow from "../workflows/sourceQuality.deadCodeAnalysis.yml";
import formattingWorkflow from "../workflows/sourceQuality.formatting.yml";
import staticAnalysisWorkflow from "../workflows/sourceQuality.staticAnalysis.yml";
import structuredDataValidationWorkflow from "../workflows/sourceQuality.structuredDataValidation.yml";
import staleWorkflow from "../workflows/stale.yml";
import syncDispatchWorkflow from "../workflows/sync-dispatch.yml";
import syncGithubWorkflow from "../workflows/sync-github.yml";
import tagWorkflow from "../workflows/tag.yml";
import performanceWorkflow from "../workflows/verification.performance.yml";
import typeSafetyWorkflow from "../workflows/verification.typeSafety.yml";
import unitTestsWorkflow from "../workflows/verification.unitTests.yml";
import visualRegressionWorkflow from "../workflows/verification.visualRegression.yml";

/** `workflow_call` implementations, by workflow name (`.github/workflows/<name>.yml`). */
export const WORKFLOWS: Record<string, string> = {
	"verification.unitTests": unitTestsWorkflow,
	"verification.visualRegression": visualRegressionWorkflow,
	"verification.typeSafety": typeSafetyWorkflow,
	"verification.performance": performanceWorkflow,
	"sourceQuality.staticAnalysis": staticAnalysisWorkflow,
	"sourceQuality.formatting": formattingWorkflow,
	"sourceQuality.structuredDataValidation": structuredDataValidationWorkflow,
	"sourceQuality.deadCodeAnalysis": deadCodeAnalysisWorkflow,
	"security.secretDetection": secretDetectionWorkflow,
	"security.codeScanning": codeScanningWorkflow,
	"delivery.build": buildWorkflow,
	"delivery.publish": publishWorkflow,
	"delivery.deploy": deployWorkflow,
	"delivery.bundleSize": bundleSizeWorkflow,
	"delivery.previewCheck": previewCheckWorkflow,
	"delivery.previewDeploy": previewDeployWorkflow,
	"platform.repoSync": repoSyncWorkflow,
	"platform.notifyCheck": notifyCheckWorkflow,
	"platform.commitStandards": commitStandardsWorkflow,
	"platform.repoValidation": repoValidationWorkflow,
	"platform.syncTemplates": syncTemplatesWorkflow,
	// Not run via any repo's own thin caller — Sentinel dispatches this
	// directly via the Actions API (holocron#769, holocron#794). No
	// WORKFLOW_TEMPLATES entry either: no repo needs to generate a
	// caller for a workflow it never invokes itself.
	"platform.dispatchedCheck": dispatchedCheckWorkflow,
	"knowledge.wiki": wikiWorkflow,
	bookkeeping: bookkeepingWorkflow,
	dependencies: dependenciesWorkflow,
	preview: previewWorkflow,
	greetings: greetingsWorkflow,
	review: reviewWorkflow,
	"security.tokenExpiry": tokenExpiryWorkflow,
	stale: staleWorkflow,
	"sync-dispatch": syncDispatchWorkflow,
	tag: tagWorkflow,
	"sync-github": syncGithubWorkflow,
};

/** Composite actions, by action name (`<name>/action.yml`). */
export const ACTIONS: Record<string, string> = {
	"auto-commit": autoCommitAction,
	"codecov-upload": codecovUploadAction,
	holocron: holocronAction,
	install: installAction,
	notify: notifyAction,
	setup: setupAction,
	"setup-node": setupNodeAction,
};
