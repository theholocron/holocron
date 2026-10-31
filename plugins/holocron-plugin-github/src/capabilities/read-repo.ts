import type { RepoSettings, SourceRepoInfo, SourceRulesetDetail, SourceSecurity } from "@theholocron/cli";
import type { GitHubClient, GitHubRepo, GitHubRulesetDetail } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";

/** The settings `repo setup` writes, which `GET /repos/{repo}` reports under the same names. */
const SETTING_KEYS = [
	"allow_squash_merge",
	"allow_merge_commit",
	"allow_rebase_merge",
	"allow_auto_merge",
	"allow_update_branch",
	"delete_branch_on_merge",
	"has_issues",
	"has_discussions",
	"has_projects",
	"has_wiki",
] as const satisfies ReadonlyArray<keyof RepoSettings & keyof GitHubRepo>;

/** The repository's description, homepage, default branch, topics and settings, from one read. */
export async function readRepoInfo(client: GitHubClient, repo: string): Promise<SourceRepoInfo> {
	const data = await client.repos.getRepo(repo);
	const settings: RepoSettings = { default_branch: data.default_branch };
	for (const key of SETTING_KEYS) {
		const value = data[key];
		if (value !== undefined) settings[key] = value;
	}
	return {
		description: data.description ?? null,
		homepage: data.homepage ?? null,
		defaultBranch: data.default_branch,
		topics: data.topics ?? [],
		settings,
	};
}

/** A ruleset reduced to what `repo setup` writes: its enforcement, rule types and required status checks. */
export function toRulesetDetail(data: GitHubRulesetDetail): SourceRulesetDetail {
	const rules = data.rules ?? [];
	const checks = rules.find((r) => r.type === "required_status_checks")?.parameters?.required_status_checks;
	return {
		name: data.name,
		enforcement: data.enforcement as SourceRulesetDetail["enforcement"],
		ruleTypes: rules.map((r) => r.type),
		requiredChecks: Array.isArray(checks) ? checks.map((c) => String((c as { context?: unknown }).context)) : [],
	};
}

/** The value, or `undefined` when GitHub refuses the read (permission, plan, feature absent). Other errors still throw. */
async function readable<T>(read: () => Promise<T>): Promise<T | undefined> {
	try {
		return await read();
	} catch (err) {
		if (err instanceof ProviderApiError) return undefined;
		throw err;
	}
}

/** Which security features are on. One GitHub refuses to report is left out, not reported as off. */
export async function readSecurity(client: GitHubClient, repo: string): Promise<SourceSecurity> {
	const [data, alerts, fixes, reporting, codeScanning] = await Promise.all([
		readable(() => client.repos.getRepo(repo)),
		readable(() => client.security.vulnerabilityAlertsEnabled(repo)),
		readable(() => client.security.automatedSecurityFixesEnabled(repo)),
		readable(() => client.security.privateVulnerabilityReportingEnabled(repo)),
		readable(() => client.security.codeScanningDefaultSetupState(repo)),
	]);
	const analysis = data?.security_and_analysis;
	const on = (feature: string): boolean | undefined => {
		const status = analysis?.[feature]?.status;
		return status === undefined ? undefined : status === "enabled";
	};
	const found: SourceSecurity = {
		vulnerabilityAlerts: alerts,
		automatedSecurityFixes: fixes,
		secretScanning: on("secret_scanning"),
		secretScanningPushProtection: on("secret_scanning_push_protection"),
		privateVulnerabilityReporting: reporting,
		codeScanningDefaultSetup: codeScanning === undefined ? undefined : codeScanning === "configured",
	};
	return Object.fromEntries(Object.entries(found).filter(([, v]) => v !== undefined)) as SourceSecurity;
}
