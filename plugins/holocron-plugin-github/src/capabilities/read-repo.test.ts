import { createGitHubClient, type GitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { readRepoInfo, readSecurity, toRulesetDetail } from "./read-repo.js";

const REPO = "theholocron/test-repo";
const client = (responses: Parameters<typeof stubFetch>[0]) =>
	createGitHubClient({ token: "pat", fetch: stubFetch(responses).fetch });

describe("readRepoInfo", () => {
	it("reports the description, homepage, topics and the settings GitHub returns", async () => {
		const info = await readRepoInfo(
			client([
				{
					body: {
						default_branch: "alpha",
						full_name: REPO,
						description: "d",
						homepage: "https://x.dev",
						topics: ["a"],
						allow_squash_merge: true,
						has_wiki: false,
					},
				},
			]),
			REPO
		);
		expect(info).toEqual({
			description: "d",
			homepage: "https://x.dev",
			defaultBranch: "alpha",
			topics: ["a"],
			settings: { default_branch: "alpha", allow_squash_merge: true, has_wiki: false },
		});
	});

	it("falls back to null and no topics when GitHub returns none", async () => {
		const info = await readRepoInfo(client([{ body: { default_branch: "main", full_name: REPO } }]), REPO);
		expect(info).toEqual({
			description: null,
			homepage: null,
			defaultBranch: "main",
			topics: [],
			settings: { default_branch: "main" },
		});
	});
});

describe("toRulesetDetail", () => {
	it("lists the rule types and the required check contexts", () => {
		expect(
			toRulesetDetail({
				id: 1,
				name: "r",
				enforcement: "active",
				rules: [
					{ type: "deletion" },
					{ type: "required_status_checks", parameters: { required_status_checks: [{ context: "DCO" }] } },
				],
			})
		).toEqual({
			name: "r",
			enforcement: "active",
			ruleTypes: ["deletion", "required_status_checks"],
			requiredChecks: ["DCO"],
		});
	});

	it("has no rules and no checks when there are none", () => {
		expect(toRulesetDetail({ id: 1, name: "r", enforcement: "disabled" })).toEqual({
			name: "r",
			enforcement: "disabled",
			ruleTypes: [],
			requiredChecks: [],
		});
		expect(
			toRulesetDetail({ id: 1, name: "r", enforcement: "active", rules: [{ type: "required_status_checks" }] })
				.requiredChecks
		).toEqual([]);
	});
});

describe("readSecurity", () => {
	it("reports every feature GitHub answers for", async () => {
		const security = await readSecurity(
			client([
				{
					body: {
						default_branch: "main",
						full_name: REPO,
						security_and_analysis: {
							secret_scanning: { status: "enabled" },
							secret_scanning_push_protection: { status: "disabled" },
						},
					},
				},
				{ status: 204 },
				{ body: { enabled: true } },
				{ body: { enabled: false } },
				{ body: { state: "not-configured" } },
			]),
			REPO
		);
		expect(security).toEqual({
			vulnerabilityAlerts: true,
			automatedSecurityFixes: true,
			secretScanning: true,
			secretScanningPushProtection: false,
			privateVulnerabilityReporting: false,
			codeScanningDefaultSetup: false,
		});
	});

	it("leaves out what GitHub refuses to report", async () => {
		const refuse = { status: 403, body: { message: "no" } };
		const security = await readSecurity(
			client([
				{ body: { default_branch: "main", full_name: REPO } },
				refuse,
				refuse,
				refuse,
				{ body: { state: "configured" } },
			]),
			REPO
		);
		expect(security).toEqual({ codeScanningDefaultSetup: true });
	});

	it("is empty when GitHub refuses every read", async () => {
		const refuse = { status: 403, body: { message: "no" } };
		await expect(readSecurity(client([refuse, refuse, refuse, refuse, refuse]), REPO)).resolves.toEqual({});
	});

	it("rethrows an error that is not GitHub's answer", async () => {
		const boom = () => Promise.reject(new Error("boom"));
		const broken = {
			repos: { getRepo: boom },
			security: {
				vulnerabilityAlertsEnabled: boom,
				automatedSecurityFixesEnabled: boom,
				privateVulnerabilityReportingEnabled: boom,
				codeScanningDefaultSetupState: boom,
			},
		} as unknown as GitHubClient;
		await expect(readSecurity(broken, REPO)).rejects.toThrow("boom");
	});
});
