import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export interface CodeScanningSetupResult {
	run_id: number;
	run_url: string;
}

export function security(rest: RestClient) {
	return {
		enableVulnerabilityAlerts: (repo: string): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/vulnerability-alerts`, {
				method: "PUT",
				expectNoContent: true,
			}),

		enableAutomatedSecurityFixes: (repo: string): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/automated-security-fixes`, {
				method: "PUT",
				expectNoContent: true,
			}),

		enableSecretScanning: (repo: string): Promise<void> =>
			rest.request<void>(repoBase(repo), {
				method: "PATCH",
				body: {
					security_and_analysis: {
						secret_scanning: { status: "enabled" },
						secret_scanning_push_protection: { status: "enabled" },
						secret_scanning_validity_checks: { status: "enabled" },
						secret_scanning_non_provider_patterns: {
							status: "enabled",
						},
					},
				},
			}),

		enablePrivateVulnerabilityReporting: (repo: string): Promise<void> =>
			rest.request<void>(
				`${repoBase(repo)}/private-vulnerability-reporting`,
				{
					method: "PUT",
					expectNoContent: true,
				},
			),

		enableDependencyGraph: (repo: string): Promise<void> =>
			rest.request<void>(repoBase(repo), {
				method: "PATCH",
				body: {
					security_and_analysis: {
						dependency_graph: { status: "enabled" },
						dependency_graph_autosubmit_action: {
							status: "enabled",
						},
					},
				},
			}),

		enableCodeScanning: (repo: string): Promise<CodeScanningSetupResult> =>
			rest.request<CodeScanningSetupResult>(
				`${repoBase(repo)}/code-scanning/default-setup`,
				{
					method: "PATCH",
					body: {
						state: "configured",
						query_suite: "extended",
						threat_model: "remote_and_local",
					},
				},
			),

		disableDefaultCodeScanning: (repo: string): Promise<void> =>
			rest.request<void>(
				`${repoBase(repo)}/code-scanning/default-setup`,
				{
					method: "PATCH",
					body: { state: "not-configured" },
				},
			),
	};
}
