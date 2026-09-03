export { runSetup } from "./run-setup.js";
export { createConfig as codecovContent, mergeCodecovComponents } from "./templates/codecov/index.js";
export type { WorkspacePackage } from "./templates/codecov/index.js";
export { installAgentPrompts } from "./agent-prompts.js";
export { installEngineeringStructure } from "./engineering.js";
export { installSkills } from "./skills.js";
export { CANONICAL_LABELS, STALE_LABELS } from "./labels.js";
export { BALANCED_REPO_SETTINGS } from "./repo-settings.js";
export { RULESET_NAME, buildClassicProtectionPayload, buildRulesetPayload } from "./branch-protection.js";
export type {
	FailReason,
	RunSetupInput,
	SetupPrintLine,
	SetupReport,
	SetupStepResult,
	SetupStatus,
} from "./run-step.js";
