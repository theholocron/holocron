import { doctorDnsCommand, runDoctorDns } from "../doctor-dns/index.js";
import { doctorEnvironmentsCommand, runDoctorEnvironments } from "../doctor-environments/index.js";
import { doctorMonitoringCommand, runDoctorMonitoring } from "../doctor-monitoring/index.js";
import { doctorNotificationsCommand, runDoctorNotifications } from "../doctor-notifications/index.js";
import { doctorSecretsCommand, runDoctorSecrets } from "../doctor-secrets/index.js";
import { doctorTokensCommand, runDoctorTokens } from "../doctor-tokens/index.js";
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
];
