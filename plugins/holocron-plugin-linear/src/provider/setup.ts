import { CANONICAL_LABELS, type ProviderAction, type ProviderRow } from "@theholocron/cli";
import type { LinearTeam } from "@theholocron/linear-client";

import type { TeamScope } from "../capabilities/team-scope.js";
import { archiveGap, type AutomationGap, closeGap } from "./automation.js";
import { type GitGap, gitGaps, knownBranches } from "./git-automation.js";
import type { LinearSetupConfig } from "./provider-config.js";
import { failure, findProject, row } from "./rows.js";
import { templateRows } from "./templates.js";

/** The colour GitHub's label of this name has, as Linear spells a colour (`#d73a4a`), or undefined. */
const colorOf = (name: string): string | undefined => {
	const known = CANONICAL_LABELS.find((l) => l.name.toLowerCase() === name.toLowerCase());
	return known ? `#${known.color}` : undefined;
};

/** Runs one step; a throw is a failing row, not the end of the run. */
async function attempt(id: string, title: string, step: () => Promise<ProviderRow>): Promise<ProviderRow> {
	try {
		return await step();
	} catch (err) {
		return failure(id, title, err);
	}
}

async function labelRows(scope: TeamScope, team: LinearTeam, names: string[], dryRun: boolean): Promise<ProviderRow[]> {
	let existing: Array<{ name: string }>;
	try {
		existing = await scope.client.teams.labels(team.id);
	} catch (err) {
		return [failure("labels", "labels", err)];
	}
	const rows: ProviderRow[] = [];
	for (const name of names) {
		const id = `label:${name}`;
		const title = `label ${name}`;
		rows.push(
			await attempt(id, title, async () => {
				if (existing.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
					return row(id, title, "ok", "already exists");
				}
				if (dryRun) return row(id, title, "ok", "would create");
				const color = colorOf(name);
				await scope.client.teams.createLabel({ name, teamId: team.id, ...(color ? { color } : {}) });
				return row(id, title, "ok", "created");
			})
		);
	}
	return rows;
}

async function automationRows(
	scope: TeamScope,
	team: LinearTeam,
	config: LinearSetupConfig,
	dryRun: boolean
): Promise<ProviderRow[]> {
	let gaps: Array<{ id: string; title: string; gap: AutomationGap }>;
	try {
		const [have, states] = await Promise.all([
			scope.client.teams.automation(team.id),
			scope.client.teams.states(team.id),
		]);
		gaps = [
			...(config.autoClose
				? [{ id: "autoClose", title: "auto-close", gap: closeGap(config.autoClose, have, states) }]
				: []),
			...(config.autoArchive
				? [{ id: "autoArchive", title: "auto-archive", gap: archiveGap(config.autoArchive, have) }]
				: []),
		];
	} catch (err) {
		return [failure("automation", "automation", err)];
	}
	const rows: ProviderRow[] = [];
	for (const { id, title, gap } of gaps) {
		rows.push(
			await attempt(id, title, async () => {
				if (gap.unresolved) return row(id, title, "fail", gap.problems.join("; "));
				if (gap.problems.length === 0) return row(id, title, "ok", "already set");
				if (dryRun) return row(id, title, "ok", `would change: ${gap.problems.join("; ")}`);
				await scope.client.teams.updateAutomation(team.id, gap.patch);
				return row(id, title, "ok", `changed: ${gap.problems.join("; ")}`);
			})
		);
	}
	return rows;
}

async function gitRows(
	scope: TeamScope,
	team: LinearTeam,
	config: LinearSetupConfig,
	dryRun: boolean
): Promise<ProviderRow[]> {
	let gaps: GitGap[];
	let branches: Map<string, string>;
	try {
		const [have, states] = await Promise.all([
			scope.client.teams.gitAutomation(team.id),
			scope.client.teams.states(team.id),
		]);
		gaps = gitGaps(config.git, have, states);
		branches = knownBranches(have);
	} catch (err) {
		return [failure("git", "git automation", err)];
	}
	const rows: ProviderRow[] = [];
	for (const { id, title, problems, action, unresolved } of gaps) {
		rows.push(
			await attempt(id, title, async () => {
				if (unresolved) return row(id, title, "fail", problems.join("; "));
				if (!action) return row(id, title, "ok", "already set");
				if (dryRun) return row(id, title, "ok", `would change: ${problems.join("; ")}`);
				if (action.kind === "update") {
					await scope.client.teams.updateGitAutomation(action.ruleId, { stateId: action.stateId });
				} else {
					let targetBranchId: string | undefined;
					if (action.branch !== undefined) {
						targetBranchId = branches.get(action.branch);
						if (!targetBranchId) {
							const made = await scope.client.teams.createGitTargetBranch({
								teamId: team.id,
								branchPattern: action.branch,
							});
							targetBranchId = made.id;
							branches.set(action.branch, made.id);
						}
					}
					await scope.client.teams.createGitAutomation({
						teamId: team.id,
						event: action.event,
						stateId: action.stateId,
						...(targetBranchId ? { targetBranchId } : {}),
					});
				}
				return row(id, title, "ok", `changed: ${problems.join("; ")}`);
			})
		);
	}
	return rows;
}

/**
 * `provider linear setup`: makes the labels and the project the block declares, sets the team's auto-close and
 * auto-archive and makes or repoints each git automation rule it declares (issue templates are reported as skipped). Each step is a row and a step that fails does not stop the next. Nothing is deleted or reordered, an
 * existing label or project is left alone, and a team that already matches changes nothing, so a second run is all `ok`.
 */
export function linearSetup(scope: TeamScope, config: LinearSetupConfig): ProviderAction {
	return async ({ dryRun }) => {
		let team: LinearTeam;
		try {
			team = await scope.team();
		} catch (err) {
			return [failure("team", `team ${config.team}`, err)];
		}
		const rows: ProviderRow[] = [];

		if (config.labels.length > 0) rows.push(...(await labelRows(scope, team, config.labels, dryRun)));

		const name = config.project;
		if (name) {
			rows.push(
				await attempt("project", `project ${name}`, async () => {
					const found = await findProject(scope, name);
					if (found) return row("project", `project ${name}`, "ok", found.url);
					if (dryRun) return row("project", `project ${name}`, "ok", "would create");
					const made = await scope.client.projects.create({ name, teamIds: [team.id] });
					return row("project", `project ${name}`, "ok", `created: ${made.url}`);
				})
			);
		}

		if (config.autoClose || config.autoArchive) rows.push(...(await automationRows(scope, team, config, dryRun)));

		if (config.git.length > 0) rows.push(...(await gitRows(scope, team, config, dryRun)));
		rows.push(...templateRows(config));
		return rows;
	};
}
