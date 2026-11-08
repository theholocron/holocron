/**
 * `issues` capability for Linear.
 *
 * Lifecycle model: Linear has real workflow states, grouped by type. Holocron's slots map to them:
 *   inProgress → the `states.inProgress` state, else the team's first `started` state
 *   inReview   → the `states.inReview` state, else a `started` state named like "review"
 *   done       → the team's first `completed` state
 *
 * Issue keys accept `ENG-42`, `42` and `#42`; the team's key fills a bare number. `milestone` on `create` names a
 * Linear project, which is where Linear keeps what GitHub calls a milestone.
 */

import type {
	ImportOptions,
	ImportResult,
	Issue,
	IssueRecord,
	Issues,
	IssueSearchFilter,
	IssueSelector,
	LifecycleResult,
	LifecycleSlot,
	SyncResult,
	TrackerDoctorReport,
	TrackerUser,
} from "@theholocron/cli";
import type { LinearIssue, LinearUser, LinearWorkflowState } from "@theholocron/linear-client";

import { exportIssues, importIssues } from "./issues-migration.js";
import { syncIssues } from "./issues-sync.js";
import { normalizeKey, pickState, statusCategory } from "./mapping.js";
import type { TeamScope } from "./team-scope.js";

/** Options of the Linear `issues` capability. */
export interface IssuesOptions {
	/** Names of the states the `inProgress` and `inReview` slots move an issue to; the team's own states by type when left out. */
	states?: { inProgress?: string; inReview?: string };
}

function toUser(u: LinearUser): TrackerUser {
	return { id: u.id, displayName: u.displayName || u.name, ...(u.email ? { emailAddress: u.email } : {}) };
}

/** The Linear implementation of the `issues` capability. */
export class LinearIssues implements Issues {
	/** Capability key, always `"issues"`. */
	readonly key = "issues" as const;
	/** Provider name, always `"linear"`. */
	readonly providerName = "linear";

	constructor(
		private readonly scope: TeamScope,
		private readonly opts: IssuesOptions = {}
	) {}

	/** The user the token belongs to. */
	async getMyself(): Promise<TrackerUser> {
		return toUser((await this.scope.client.teams.viewer()).user);
	}

	/** The team's issues, newest update first. */
	async search(filter: IssueSearchFilter): Promise<Issue[]> {
		const team = await this.scope.team();
		const assigneeId =
			filter.assignee === "currentUser"
				? (await this.scope.client.teams.viewer()).user.id
				: filter.assignee || undefined;
		const raw = await this.scope.client.issues.list({
			teamId: team.id,
			...(assigneeId ? { assigneeId } : {}),
			...(filter.openOnly ? { openOnly: true } : {}),
			limit: filter.limit ?? 50,
		});
		return raw.map(mapIssue);
	}

	/** One issue by its key. */
	async get(key: string): Promise<Issue> {
		return mapIssue(await this.scope.client.issues.get(normalizeKey(key, this.scope.teamKey)));
	}

	/** Makes an issue; labels the team lacks are made, and `milestone` is a project's name or id. */
	async create(input: {
		summary: string;
		body?: string;
		labels?: string[];
		milestone?: string;
	}): Promise<{ key: string }> {
		const { client } = this.scope;
		const team = await this.scope.team();
		const labelIds = input.labels?.length ? await this.labelIds(team.id, input.labels) : [];
		let projectId: string | undefined;
		if (input.milestone) {
			const projects = await client.projects.list();
			const match = projects.find(
				(p) => p.id === input.milestone || p.name.toLowerCase() === input.milestone!.toLowerCase()
			);
			if (!match)
				throw new Error(`Project "${input.milestone}" not found in Linear. Use the id or an exact name.`);
			projectId = match.id;
		}
		const issue = await client.issues.create({
			teamId: team.id,
			title: input.summary,
			...(input.body ? { description: input.body } : {}),
			...(labelIds.length > 0 ? { labelIds } : {}),
			...(projectId ? { projectId } : {}),
		});
		return { key: issue.identifier };
	}

	/** Moves the issue to the state its slot names. Idempotent. */
	async transition(key: string, slot: LifecycleSlot): Promise<LifecycleResult> {
		const team = await this.scope.team();
		const issue = await this.scope.client.issues.get(normalizeKey(key, this.scope.teamKey));
		const states = await this.scope.client.teams.states(team.id);
		const target = this.stateFor(slot, states);
		if (!target) {
			throw new Error(
				`no Linear state for \`${slot}\` in team ${team.key}; name one with \`states.${slot}\` in the plugin options`
			);
		}
		if (issue.state.id === target.id) return { transitioned: false, status: target.name, via: "already there" };
		await this.scope.client.issues.update(issue.id, { stateId: target.id });
		return { transitioned: true, status: target.name, via: `state set to ${target.name}` };
	}

	/** Adds a comment to the issue. */
	async comment(key: string, body: string): Promise<void> {
		const issue = await this.scope.client.issues.get(normalizeKey(key, this.scope.teamKey));
		await this.scope.client.issues.comment(issue.id, body);
	}

	/** Checks the user, the team and which states the lifecycle slots resolve to. */
	async doctor(): Promise<TrackerDoctorReport> {
		const { user } = await this.scope.client.teams.viewer();
		const team = await this.scope.team();
		const states = await this.scope.client.teams.states(team.id);
		const slots: LifecycleSlot[] = ["inProgress", "inReview", "done"];
		return {
			authedAs: `${user.displayName} (${user.email ?? user.id})`,
			projectLabel: `Team: ${team.key} (${team.name})`,
			statuses: states.map((s) => ({ name: s.name, category: statusCategory(s) })),
			lifecycle: slots.map((slot) => {
				const state = this.stateFor(slot, states);
				return {
					slot,
					value: state?.name ?? null,
					resolved: state !== undefined,
					note: state
						? `state exists in team ${team.key}`
						: `no matching state; set \`states.${slot}\` in the plugin options`,
				};
			}),
		};
	}

	/** Reads issues with comments, priority, labels, parent and blockers, for `holocron migrate`. */
	export(selector: IssueSelector): Promise<IssueRecord[]> {
		return exportIssues(this.scope, selector);
	}

	/** Makes the records as issues in the team; one already made by an earlier run is skipped. */
	import(records: IssueRecord[], options?: ImportOptions): Promise<ImportResult[]> {
		return importIssues(this.scope, records, options);
	}

	/** Like `import`, and it also updates what an earlier import or sync made, for `holocron sync issues`. */
	sync(records: IssueRecord[], options?: ImportOptions): Promise<SyncResult[]> {
		return syncIssues(this.scope, records, options);
	}

	private stateFor(slot: LifecycleSlot, states: LinearWorkflowState[]): LinearWorkflowState | undefined {
		if (slot === "done") return pickState(states, { category: "done" });
		const name = this.opts.states?.[slot];
		return pickState(states, {
			...(name ? { name } : {}),
			category: slot === "inReview" ? "in-review" : "in-progress",
		});
	}

	private async labelIds(teamId: string, names: string[]): Promise<string[]> {
		const have = new Map((await this.scope.client.teams.labels(teamId)).map((l) => [l.name.toLowerCase(), l.id]));
		const ids: string[] = [];
		for (const name of names) {
			let id = have.get(name.toLowerCase());
			if (!id) {
				id = (await this.scope.client.teams.createLabel({ name, teamId })).id;
				have.set(name.toLowerCase(), id);
			}
			ids.push(id);
		}
		return ids;
	}
}

function mapIssue(raw: LinearIssue): Issue {
	return {
		key: raw.identifier,
		id: raw.id,
		summary: raw.title,
		...(raw.description ? { body: raw.description } : {}),
		status: raw.state.name,
		statusCategory: statusCategory(raw.state),
		assignee: raw.assignee ? toUser(raw.assignee) : null,
		updated: raw.updatedAt,
		url: raw.url,
	};
}
