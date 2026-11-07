/**
 * `projects` capability for Linear.
 *
 * Vocabulary: a board is a Linear project, an item is an issue (its key is `ENG-42`), a status is one of the team's
 * workflow states, and a rule is one of the team's automations (auto-archive, auto-close).
 *
 * What differs from GitHub, on purpose:
 *  - statuses belong to the team, not the project, so `ensure` adds them for every project of the team;
 *  - priority is a built-in of every issue, so the `Priority` field always exists and cannot be reshaped;
 *  - there are no custom fields and no saved views to manage, so a template's other fields and views come back as
 *    `todos`, not as changes;
 *  - automation is switched in Linear's team settings; the API reads it, so a rule that is off is a `todo`.
 */

import type {
	BoardField,
	BoardItem,
	BoardRule,
	BoardState,
	BoardSummary,
	BoardTemplate,
	EnsureReport,
	LifecycleResult,
	MoveReport,
	Projects,
} from "@theholocron/cli";
import type { LinearProject } from "@theholocron/linear-client";

import { boardCategory, fromLinearPriority, isClosed, normalizeKey, stateTypeFor } from "./mapping.js";
import type { TeamScope } from "./team-scope.js";

/** The names of the two automations the team settings expose, which a template's `rules` can ask for. */
export const AUTO_ARCHIVE_RULE = "Auto-archive closed issues";
/** See {@link AUTO_ARCHIVE_RULE}. */
export const AUTO_CLOSE_RULE = "Auto-close stale issues";

const PRIORITY_FIELD: BoardField = {
	name: "Priority",
	type: "single_select",
	options: ["Urgent", "High", "Medium", "Low"],
};

function toSummary(p: LinearProject): BoardSummary {
	return { id: p.id, name: p.name, url: p.url, closed: p.archivedAt !== null };
}

/** The Linear implementation of the `projects` capability, backed by Linear projects and the team's workflow. */
export class LinearProjects implements Projects {
	/** Capability key, always `"projects"`. */
	readonly key = "projects" as const;
	/** Provider name, always `"linear"`. */
	readonly providerName = "linear";

	constructor(private readonly scope: TeamScope) {}

	/** Every project of the team, open and archived. The owner is the workspace, which the token already names. */
	async list(_owner: string): Promise<BoardSummary[]> {
		const team = await this.scope.team();
		const all = await this.scope.client.projects.list();
		return all.filter((p) => p.teams.nodes.some((t) => t.id === team.id)).map(toSummary);
	}

	/** The open project with exactly this name. */
	async find(owner: string, name: string): Promise<BoardSummary | undefined> {
		return (await this.list(owner)).find((b) => !b.closed && b.name === name);
	}

	/** Makes a project for the team and brings the team's statuses in line with the template. */
	async create(owner: string, name: string, template: BoardTemplate): Promise<BoardSummary> {
		const team = await this.scope.team();
		const board = toSummary(await this.scope.client.projects.create({ name, teamIds: [team.id] }));
		await this.ensure(owner, board, template);
		return board;
	}

	/** Archives the project. Reversible in Linear. */
	async close(_owner: string, board: BoardSummary): Promise<void> {
		await this.scope.client.projects.archive(board.id);
	}

	/** The team's statuses, the built-in priority, and the team's automation. */
	async read(_owner: string, board: BoardSummary): Promise<BoardState> {
		const team = await this.scope.team();
		const [states, automation] = await Promise.all([
			this.scope.client.teams.states(team.id),
			this.scope.client.teams.automation(team.id),
		]);
		return {
			board,
			statuses: states.map((s) => s.name),
			fields: [PRIORITY_FIELD],
			views: [],
			rules: rulesOf(automation),
		};
	}

	/**
	 * Adds the template's missing statuses to the team (never removes or renames one). Everything Linear cannot
	 * create from the API is a `todo`.
	 */
	async ensure(_owner: string, _board: BoardSummary, template: BoardTemplate): Promise<EnsureReport> {
		const team = await this.scope.team();
		const [states, automation] = await Promise.all([
			this.scope.client.teams.states(team.id),
			this.scope.client.teams.automation(team.id),
		]);
		const changes: string[] = [];
		const todos: string[] = [];

		for (const want of template.statuses) {
			if (states.some((s) => s.name.toLowerCase() === want.name.toLowerCase())) continue;
			await this.scope.client.teams.createState(team.id, {
				name: want.name,
				type: stateTypeFor(want.category),
				...(want.description ? { description: want.description } : {}),
			});
			changes.push(`status ${want.name} added to team ${team.key}`);
		}
		for (const field of template.fields) {
			if (field.name === PRIORITY_FIELD.name) continue;
			todos.push(`field "${field.name}": Linear has no custom fields; use labels or put it in the description`);
		}
		for (const view of template.views) {
			todos.push(`view "${view.name}": create it in Linear; views are not managed here`);
		}
		const rules = rulesOf(automation);
		for (const rule of template.rules ?? []) {
			const have = rules.find((r) => r.name.toLowerCase() === rule.toLowerCase());
			if (!have) todos.push(`automation "${rule}": Linear has no such team setting`);
			else if (!have.enabled)
				todos.push(`turn on "${rule}" in Linear: Settings → Teams → ${team.name} → Workflow`);
		}
		return { created: false, changes, todos };
	}

	/** The project's issues with status, whether they are open, priority and open blockers. */
	async items(_owner: string, board: BoardSummary, template: BoardTemplate): Promise<BoardItem[]> {
		const categories = new Map(template.statuses.map((s) => [s.name.toLowerCase(), s.category]));
		const issues = await this.scope.client.issues.list({ projectId: board.id });
		return issues.map((issue) => {
			const priority = fromLinearPriority(issue.priority);
			return {
				key: issue.identifier,
				title: issue.title,
				open: !isClosed(issue.state.type),
				status: issue.state.name,
				category: categories.get(issue.state.name.toLowerCase()) ?? boardCategory(issue.state),
				blockedBy: issue.inverseRelations.nodes
					.filter((r) => r.type === "blocks" && !isClosed(r.issue.state.type))
					.map((r) => r.issue.identifier),
				...(priority ? { priority } : {}),
			};
		});
	}

	/** Puts an issue in the team state with this name; `transitioned` is false when it already is there. */
	async setStatus(_owner: string, _board: BoardSummary, key: string, status: string): Promise<LifecycleResult> {
		const team = await this.scope.team();
		const issue = await this.scope.client.issues.get(normalizeKey(key, this.scope.teamKey));
		const states = await this.scope.client.teams.states(team.id);
		const target = states.find((s) => s.name.toLowerCase() === status.toLowerCase());
		if (!target) throw new Error(`team ${team.key} has no status "${status}"`);
		if (issue.state.id === target.id) return { transitioned: false, status: target.name, via: "already there" };
		await this.scope.client.issues.update(issue.id, { stateId: target.id });
		return { transitioned: true, status: target.name };
	}

	/**
	 * Moves the open issues of one project into another. An issue is in one project, so there is nothing to keep on the
	 * target; status and priority belong to the issue and travel with it. Closed issues stay where they are.
	 */
	async move(_owner: string, from: BoardSummary, to: BoardSummary, _template: BoardTemplate): Promise<MoveReport> {
		const issues = await this.scope.client.issues.list({ projectId: from.id });
		const report: MoveReport = { moved: [], kept: [], left: [] };
		for (const issue of issues) {
			if (isClosed(issue.state.type)) {
				report.left.push(issue.identifier);
				continue;
			}
			await this.scope.client.issues.update(issue.id, { projectId: to.id });
			report.moved.push(issue.identifier);
		}
		return report;
	}

	/** A smoke check: how many projects the token can see for the team. */
	async whoami(): Promise<{ ok: boolean; boards: number }> {
		return { ok: true, boards: (await this.list("")).length };
	}
}

function rulesOf(a: { autoArchivePeriod: number | null; autoClosePeriod: number | null }): BoardRule[] {
	return [
		{ name: AUTO_ARCHIVE_RULE, enabled: (a.autoArchivePeriod ?? 0) > 0 },
		{ name: AUTO_CLOSE_RULE, enabled: (a.autoClosePeriod ?? 0) > 0 },
	];
}
