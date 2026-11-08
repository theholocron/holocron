import type { ProviderAction, ProviderRow } from "@theholocron/cli";
import type { LinearTeam } from "@theholocron/linear-client";

import type { TeamScope } from "../capabilities/team-scope.js";
import { archiveGap, closeGap } from "./automation.js";
import { gitGaps } from "./git-automation.js";
import type { LinearSetupConfig } from "./provider-config.js";
import { failure, findProject, row } from "./rows.js";
import { templateRows } from "./templates.js";

const FIX = "run `holocron provider linear setup`";

/** `ok` with the detail when nothing differs, otherwise `fail` with a line per difference and the fix. */
const verdict = (id: string, title: string, detail: string, problems: string[]): ProviderRow =>
	problems.length === 0 ? row(id, title, "ok", detail) : row(id, title, "fail", problems[0]!, [...problems, FIX]);

/**
 * `provider linear doctor`: one row for the team and one for each label, the project, each auto-close and
 * auto-archive setting and each git automation rule the block declares. Read-only; a row that fails names `provider linear setup` as the fix.
 */
export function linearDoctor(scope: TeamScope, config: LinearSetupConfig): ProviderAction {
	return async () => {
		let team: LinearTeam;
		try {
			team = await scope.team();
		} catch (err) {
			return [failure("team", `team ${config.team}`, err)];
		}
		const rows: ProviderRow[] = [row("team", `team ${config.team}`, "ok", team.name)];

		if (config.labels.length > 0) {
			try {
				const existing = (await scope.client.teams.labels(team.id)).map((l) => l.name.toLowerCase());
				for (const name of config.labels) {
					const found = existing.includes(name.toLowerCase());
					rows.push(verdict(`label:${name}`, `label ${name}`, "present", found ? [] : ["missing"]));
				}
			} catch (err) {
				rows.push(failure("labels", "labels", err));
			}
		}

		const name = config.project;
		if (name) {
			try {
				const found = await findProject(scope, name);
				rows.push(
					verdict(
						"project",
						`project ${name}`,
						found?.url ?? "",
						found ? [] : ["no open project of the team has this name"]
					)
				);
			} catch (err) {
				rows.push(failure("project", `project ${name}`, err));
			}
		}

		if (config.autoClose || config.autoArchive) {
			try {
				const [have, states] = await Promise.all([
					scope.client.teams.automation(team.id),
					scope.client.teams.states(team.id),
				]);
				if (config.autoClose) {
					const { months, state } = config.autoClose;
					rows.push(
						verdict(
							"autoClose",
							"auto-close",
							`${months} months${state ? ` to ${state}` : ""}`,
							closeGap(config.autoClose, have, states).problems
						)
					);
				}
				if (config.autoArchive) {
					rows.push(
						verdict(
							"autoArchive",
							"auto-archive",
							`${config.autoArchive.months} months`,
							archiveGap(config.autoArchive, have).problems
						)
					);
				}
			} catch (err) {
				rows.push(failure("automation", "automation", err));
			}
		}

		if (config.git.length > 0) {
			try {
				const [have, states] = await Promise.all([
					scope.client.teams.gitAutomation(team.id),
					scope.client.teams.states(team.id),
				]);
				for (const gap of gitGaps(config.git, have, states)) {
					const detail = gap.title.replace("git automation ", "");
					rows.push(verdict(gap.id, gap.title, detail, gap.problems));
				}
			} catch (err) {
				rows.push(failure("git", "git automation", err));
			}
		}
		rows.push(...templateRows(config));
		return rows;
	};
}
