import { createAstromech } from "@theholocron/astromech";
import type { TasksConfig } from "@theholocron/astromech/config";

import type { ResolvedHolocronConfig } from "../../config/index.js";
import { getLogger } from "../../observability/logger/index.js";
import { ProviderApiError, type SourceSecurity, type TeamEntry } from "../../plugin/index.js";
import { declaredVsActual } from "../doctor-checks/index.js";
import { RULESET_NAME } from "../setup/branch-protection.js";
import { CANONICAL_LABELS, STALE_LABELS } from "../setup/labels.js";
import { BALANCED_REPO_SETTINGS } from "../setup/repo-settings.js";
import type { RepoCheck } from "./doctor-repo.type.js";

const quote = (value: unknown): string => JSON.stringify(value);
const onOff = (value: boolean): string => (value ? "on" : "off");

/**
 * The groups of repository settings `repo setup` writes through the `source` capability, each only when the config
 * declares it (labels and security toggles are always written, so they are always checked). Variables, secrets and
 * environments are separate checks. Pages, `CODEOWNERS` and the generated files are not compared here.
 */
export function repoChecks(config: ResolvedHolocronConfig, repoRoot: string): RepoCheck[] {
	const repo = config.repo;
	const preset = repo?.protection && repo.protection !== "none" ? repo.protection : undefined;
	const checks: RepoCheck[] = [];

	if (config.description || config.homepage) {
		checks.push({
			id: "repo-description",
			title: "description and homepage match",
			needs: "getRepoInfo",
			async run(source) {
				const info = await source.getRepoInfo!();
				const declared = new Map<string, string>();
				if (config.description) declared.set("description", config.description);
				if (config.homepage) declared.set("homepage", config.homepage);
				const actual = new Map([
					["description", info.description ?? ""],
					["homepage", info.homepage ?? ""],
				]);
				const problems = declaredVsActual(declared, actual, {
					noun: "repository field",
					flagExtra: false,
					show: quote,
				});
				return { problems, checked: declared.size };
			},
		});
	}

	if (repo?.defaultBranch || preset) {
		checks.push({
			id: "repo-settings",
			title: "default branch and settings match",
			needs: "getRepoInfo",
			async run(source) {
				const info = await source.getRepoInfo!();
				// `repo setup` applies the balanced settings only when a protection preset is set.
				const declared = new Map(
					Object.entries(preset ? BALANCED_REPO_SETTINGS : {}) as Array<[string, boolean | string]>
				);
				if (repo?.defaultBranch) declared.set("default_branch", repo.defaultBranch);
				const actual = new Map(Object.entries(info.settings) as Array<[string, boolean | string]>);
				const problems = declaredVsActual(declared, actual, {
					noun: "repository setting",
					flagExtra: false,
					show: quote,
				});
				return { problems, checked: declared.size };
			},
		});
	}

	if (repo?.topics && repo.topics.length > 0) {
		const topics = repo.topics;
		checks.push({
			id: "repo-topics",
			title: "topics match",
			needs: "getRepoInfo",
			async run(source) {
				const info = await source.getRepoInfo!();
				// `repo setup` replaces the whole set, so a topic it does not name is one it would remove.
				const problems = declaredVsActual(
					new Map(topics.map((t) => [t, true])),
					new Map(info.topics.map((t) => [t, true])),
					{ noun: "topic" }
				);
				return { problems, checked: topics.length };
			},
		});
	}

	const properties = declaredProperties(config);
	if (properties.size > 0) {
		checks.push({
			id: "repo-properties",
			title: "custom properties match",
			needs: "getProperties",
			async run(source) {
				const found = await source.getProperties!();
				const actual = new Map(
					Object.entries(found).map(([name, v]) => [name, Array.isArray(v) ? v.join(",") : v])
				);
				const problems = declaredVsActual(properties, actual, {
					noun: "property",
					flagExtra: false,
					show: quote,
				});
				return { problems, checked: properties.size };
			},
		});
	}

	checks.push({
		id: "repo-labels",
		title: "labels match",
		needs: "listLabels",
		async run(source) {
			const found = await source.listLabels!();
			const actual = new Map(found.map((l) => [l.name.toLowerCase(), l]));
			const problems = declaredVsActual(new Map(CANONICAL_LABELS.map((l) => [l.name, l])), actual, {
				noun: "label",
				flagExtra: false,
				equal: (a, b) => a.color === b.color && a.description === b.description,
				show: (l) => `${l.color} ${quote(l.description)}`,
			});
			// Labels outside the canonical set are left alone, except the stale ones `repo setup` deletes.
			for (const name of STALE_LABELS)
				if (actual.has(name)) problems.push(`stale label ${name} (repo setup removes it)`);
			return { problems, checked: CANONICAL_LABELS.length };
		},
	});

	if (repo?.teams && repo.teams.length > 0) {
		const teams = repo.teams;
		checks.push({
			id: "repo-teams",
			title: "team access matches",
			needs: "listTeamAccess",
			async run(source) {
				const found = await source.listTeamAccess!();
				const problems = declaredVsActual(
					new Map(teams.map(teamPermission)),
					new Map(found.map((t) => [t.slug, t.permission])),
					{ noun: "team", flagExtra: false, show: quote }
				);
				return { problems, checked: teams.length };
			},
		});
	}

	if (preset) {
		checks.push({
			id: "repo-protection",
			title: "branch protection matches",
			needs: "getRulesetDetail",
			async run(source) {
				let rulesets;
				try {
					rulesets = await source.listRulesets();
				} catch (err) {
					// Free plans have no rulesets API; `repo setup` then falls back to classic protection, which is not read here.
					if (err instanceof ProviderApiError && err.status === 403) {
						return {
							skip: "rulesets are not available on this plan (classic branch protection is not read)",
						};
					}
					throw err;
				}
				const found = rulesets.find((r) => r.name === RULESET_NAME);
				if (!found) return { problems: [`missing ruleset ${RULESET_NAME}`], checked: 1 };
				const detail = await source.getRulesetDetail!(found.id);
				const required = preset === "strict" ? strictChecks(config, repoRoot) : [];
				const rules = [
					"deletion",
					"non_fast_forward",
					"pull_request",
					...(required.length > 0 ? ["required_status_checks"] : []),
				];
				const problems = [
					...declaredVsActual(
						new Map([["enforcement", "active"]]),
						new Map([["enforcement", detail.enforcement]]),
						{
							noun: "ruleset",
							show: quote,
						}
					),
					...declaredVsActual(
						new Map(rules.map((r) => [r, true])),
						new Map(detail.ruleTypes.map((r) => [r, true])),
						{
							noun: "ruleset rule",
						}
					),
					...declaredVsActual(
						new Map(required.map((c) => [c, true])),
						new Map(detail.requiredChecks.map((c) => [c, true])),
						{ noun: "required check" }
					),
				];
				return { problems, checked: 1 + rules.length + required.length };
			},
		});
	}

	checks.push({
		id: "repo-security",
		title: "security settings match",
		needs: "getSecurity",
		async run(source) {
			const found = await source.getSecurity!();
			// `repo setup` turns every one on, and turns CodeQL default setup off when an advanced workflow replaces it.
			const advanced = (config.tasks ?? [])
				.map((e) => (typeof e === "string" ? e : e.name))
				.includes("security.codeScanning");
			const wanted: Required<SourceSecurity> = {
				vulnerabilityAlerts: true,
				automatedSecurityFixes: true,
				secretScanning: true,
				secretScanningPushProtection: true,
				privateVulnerabilityReporting: true,
				codeScanningDefaultSetup: !advanced,
			};
			// A feature the provider did not report (plan, token) is not a difference.
			const declared = new Map(Object.entries(wanted).filter(([k]) => k in found));
			if (declared.size === 0) return { skip: "the provider reported none of the security settings" };
			const problems = declaredVsActual(declared, new Map(Object.entries(found) as [string, boolean][]), {
				noun: "security setting",
				flagExtra: false,
				show: onOff,
			});
			return { problems, checked: declared.size };
		},
	});

	return checks;
}

function teamPermission(entry: TeamEntry): [string, string] {
	return typeof entry === "string" ? [entry, "push"] : [entry.slug, entry.permission];
}

/** The custom properties the config declares (and the protection level `repo setup` stamps), as text. */
function declaredProperties(config: ResolvedHolocronConfig): Map<string, string> {
	const repo = config.repo;
	const out = new Map<string, string>();
	if (repo?.protection && repo.protection !== "none") out.set("holocron_branch_protection_level", repo.protection);
	const manual = repo?.properties ?? {};
	if (manual.lifecycle) out.set("lifecycle", manual.lifecycle);
	if (manual.open_source !== undefined) out.set("open_source", String(manual.open_source));
	if (manual.runtime_environment) out.set("runtime_environment", manual.runtime_environment);
	if (manual.uses_external_packages !== undefined)
		out.set("uses_external_packages", String(manual.uses_external_packages));
	return out;
}

/** The status checks a `strict` ruleset requires, derived from the task manifest exactly as `repo setup` does. */
function strictChecks(config: ResolvedHolocronConfig, repoRoot: string): string[] {
	const tasksConfig: TasksConfig = { tasks: config.tasks as TasksConfig["tasks"] };
	if (config.extraRequiredChecks) tasksConfig.extraRequiredChecks = config.extraRequiredChecks;
	return ["DCO", ...createAstromech({ cwd: repoRoot, config: tasksConfig, logger: getLogger() }).requiredChecks()];
}
