import { doctorCiCommand, runDoctorCi } from "../doctor-ci/index.js";
import { doctorCredentialsCommand, runDoctorCredentials } from "../doctor-credentials/index.js";
import { doctorDnsCommand, runDoctorDns } from "../doctor-dns/index.js";
import { doctorEnvironmentsCommand, runDoctorEnvironments } from "../doctor-environments/index.js";
import { doctorGitHubAppCommand, runDoctorGitHubApp } from "../doctor-github-app/index.js";
import { doctorLogsCommand, runDoctorLogs } from "../doctor-logs/index.js";
import { doctorMonitoringCommand, runDoctorMonitoring } from "../doctor-monitoring/index.js";
import { doctorNotificationsCommand, runDoctorNotifications } from "../doctor-notifications/index.js";
import { doctorProjectCommand, runDoctorProject } from "../doctor-project/index.js";
import { doctorRepoCommand, runDoctorRepo } from "../doctor-repo/index.js";
import { doctorSecretsCommand, runDoctorSecrets } from "../doctor-secrets/index.js";
import { doctorSharedValuesCommand, runDoctorSharedValues } from "../doctor-shared-values/index.js";
import { doctorTokensCommand, runDoctorTokens } from "../doctor-tokens/index.js";
import { doctorVariableOwnersCommand, runDoctorVariableOwners } from "../doctor-variable-owners/index.js";
import { doctorVariablesCommand, runDoctorVariables } from "../doctor-variables/index.js";
import type { DeepCheck } from "./deep-checks.type.js";

/**
 * Every `doctor <capability>` deep check, in the order `doctor --all` runs them. Adding one is an entry here
 * plus its `COMMAND_CONTEXTS` and `COMMAND_REGISTRY` entries; `deep-checks.test.ts` fails without them.
 */
export const DEEP_CHECKS: readonly DeepCheck[] = [
	{
		name: "notifications",
		capability: "notifications",
		command: doctorNotificationsCommand as never,
		async run(input) {
			// `doctor --all` never changes anything, so it leaves out the step that posts a test message.
			const report = await runDoctorNotifications({ ...input, builtOnly: true });
			// A run that could not verify anything (no provider, no layout) has nothing to compare: here that is
			// a skip with its reason, where `doctor notifications` on its own fails.
			if (report.message) {
				return { status: "skip", summary: { ok: 0, fail: 0, skip: 1 }, reason: report.message };
			}
			return {
				status: report.status,
				summary: { ok: report.summary.pass, fail: report.summary.fail, skip: report.summary.skip },
			};
		},
	},
	{
		name: "environments",
		capability: "environments",
		command: doctorEnvironmentsCommand as never,
		async run(input) {
			const report = await runDoctorEnvironments(input);
			return {
				status: report.status,
				summary: report.summary,
				...(report.reason ? { reason: report.reason } : {}),
			};
		},
	},
	{
		name: "monitoring",
		capability: "monitoring",
		command: doctorMonitoringCommand as never,
		async run(input) {
			const report = await runDoctorMonitoring(input);
			return {
				status: report.status,
				summary: report.summary,
				...(report.reason ? { reason: report.reason } : {}),
			};
		},
	},
	{
		name: "dns",
		capability: "dns",
		command: doctorDnsCommand as never,
		async run(input) {
			const report = await runDoctorDns(input);
			return {
				status: report.status,
				summary: report.summary,
				...(report.reason ? { reason: report.reason } : {}),
			};
		},
	},
	{
		name: "repo",
		capability: "source",
		command: doctorRepoCommand as never,
		async run(input) {
			const report = await runDoctorRepo(input);
			return {
				status: report.status,
				summary: report.summary,
				...(report.reason ? { reason: report.reason } : {}),
			};
		},
	},
	{
		name: "secrets",
		capability: "secrets",
		command: doctorSecretsCommand as never,
		async run(input) {
			const report = await runDoctorSecrets(input);
			return {
				status: report.status,
				summary: report.summary,
				...(report.reason ? { reason: report.reason } : {}),
			};
		},
	},
	{
		name: "credentials",
		capability: "credentials",
		command: doctorCredentialsCommand as never,
		async run(input) {
			const report = await runDoctorCredentials(input);
			return {
				status: report.status,
				summary: report.summary,
				...(report.reason ? { reason: report.reason } : {}),
			};
		},
	},
	{
		name: "tokens",
		capability: "source",
		command: doctorTokensCommand as never,
		async run(input) {
			const report = await runDoctorTokens(input);
			return {
				status: report.status,
				summary: report.summary,
				...(report.reason ? { reason: report.reason } : {}),
			};
		},
	},
	{
		name: "variables",
		capability: "source",
		command: doctorVariablesCommand as never,
		async run(input) {
			const report = await runDoctorVariables(input);
			return {
				status: report.status,
				summary: report.summary,
				...(report.reason ? { reason: report.reason } : {}),
			};
		},
	},
	{
		name: "variable-owners",
		// It compares names across the 1Password Environments (`credentials`) and GitHub (`secrets`, `source`).
		capability: "credentials",
		command: doctorVariableOwnersCommand as never,
		async run(input) {
			const report = await runDoctorVariableOwners(input);
			return {
				status: report.status,
				summary: report.summary,
				...(report.reason ? { reason: report.reason } : {}),
			};
		},
	},
	{
		name: "shared-values",
		// It reads each layer's Environment in memory through the `vault` provider.
		capability: "vault",
		command: doctorSharedValuesCommand as never,
		async run(input) {
			const report = await runDoctorSharedValues(input);
			return {
				status: report.status,
				summary: report.summary,
				...(report.reason ? { reason: report.reason } : {}),
			};
		},
	},
	{
		name: "ci",
		// It reads the config and the workflow files, no provider; `source` is the capability the repo's CI belongs to.
		capability: "source",
		command: doctorCiCommand as never,
		async run(input) {
			// Never a skip: the tasks row always runs, so there is no reason to carry.
			const report = await runDoctorCi(input);
			return { status: report.status, summary: report.summary };
		},
	},
	{
		name: "github-app",
		capability: "vault",
		command: doctorGitHubAppCommand as never,
		async run(input) {
			const report = await runDoctorGitHubApp(input);
			return {
				status: report.status,
				summary: report.summary,
				...(report.reason ? { reason: report.reason } : {}),
			};
		},
	},
	{
		name: "logs",
		capability: "logs",
		command: doctorLogsCommand as never,
		async run(input) {
			const report = await runDoctorLogs(input);
			return {
				status: report.status,
				summary: report.summary,
				...(report.reason ? { reason: report.reason } : {}),
			};
		},
	},
	{
		name: "project",
		capability: "projects",
		command: doctorProjectCommand as never,
		async run(input) {
			const report = await runDoctorProject(input);
			return {
				status: report.status,
				summary: report.summary,
				...(report.reason ? { reason: report.reason } : {}),
			};
		},
	},
];
