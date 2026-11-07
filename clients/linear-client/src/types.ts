/** The kinds of workflow state Linear groups its states into. */
export type LinearStateType = "triage" | "backlog" | "unstarted" | "started" | "completed" | "canceled";

/** Linear's priority: 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
export type LinearPriority = 0 | 1 | 2 | 3 | 4;

/** A person in the workspace. */
export interface LinearUser {
	id: string;
	name: string;
	displayName: string;
	email?: string;
}

/** A team, which owns issues, workflow states and their automation. */
export interface LinearTeam {
	id: string;
	key: string;
	name: string;
}

/** A team's automation settings: how Linear archives and closes issues on its own. */
export interface LinearTeamAutomation {
	/** Months after which a closed issue is archived; 0 or null for never. */
	autoArchivePeriod: number | null;
	/** Months of inactivity after which an issue is closed; 0 or null for never. */
	autoClosePeriod: number | null;
	/** The state an auto-closed issue is put in. */
	autoCloseState: { id: string; name: string } | null;
	/** Whether the team uses triage. */
	triageEnabled: boolean;
}

/** One status an issue can be in, belonging to a team. */
export interface LinearWorkflowState {
	id: string;
	name: string;
	type: LinearStateType;
	color: string;
	description?: string | null;
	position: number;
}

/** A label, workspace-wide (`team` null) or a team's. */
export interface LinearLabel {
	id: string;
	name: string;
	color: string;
	team: { id: string } | null;
}

/** A relation from an issue to another: `type` is `blocks`, `duplicate`, `related` or `similar`. */
export interface LinearRelation {
	id: string;
	type: string;
	/** The issue the relation points at. */
	relatedIssue: { id: string; identifier: string };
}

/** A relation that points at the issue; `issue` is the one it starts from, so for `blocks` it is the blocker. */
export interface LinearInverseRelation {
	id: string;
	type: string;
	issue: { id: string; identifier: string; state: { type: LinearStateType } };
}

/** An issue as Linear returns it. */
export interface LinearIssue {
	id: string;
	/** `ENG-42`. */
	identifier: string;
	number: number;
	title: string;
	description: string | null;
	priority: LinearPriority;
	priorityLabel: string;
	estimate: number | null;
	dueDate: string | null;
	url: string;
	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
	canceledAt: string | null;
	state: { id: string; name: string; type: LinearStateType };
	team: { id: string; key: string };
	assignee: LinearUser | null;
	labels: { nodes: Array<{ id: string; name: string }> };
	project: { id: string; name: string } | null;
	parent: { id: string; identifier: string } | null;
	/** Relations that start at this issue (it `blocks` the related one). */
	relations: { nodes: LinearRelation[] };
	/** Relations that point at this issue (the `issue` of a `blocks` one blocks it). */
	inverseRelations: { nodes: LinearInverseRelation[] };
}

/** A comment on an issue. */
export interface LinearComment {
	id: string;
	body: string;
	createdAt: string;
	user: { id: string; name: string; displayName: string } | null;
}

/** What `issues.create` accepts. */
export interface LinearIssueCreate {
	teamId: string;
	title: string;
	description?: string;
	priority?: LinearPriority;
	stateId?: string;
	assigneeId?: string;
	labelIds?: string[];
	projectId?: string;
	parentId?: string;
	estimate?: number;
	dueDate?: string;
	/** Backdates the issue, which a migration uses to keep the original date. */
	createdAt?: string;
}

/** What `issues.update` accepts; a field left out is left alone. */
export type LinearIssueUpdate = Partial<Omit<LinearIssueCreate, "teamId" | "createdAt">>;

/** What `issues.list` narrows by. */
export interface LinearIssueFilter {
	teamId?: string;
	projectId?: string;
	assigneeId?: string;
	/** Leave out issues that are completed or canceled. */
	openOnly?: boolean;
	/** Stop after this many issues. */
	limit?: number;
}

/** A project, Linear's board of work. */
export interface LinearProject {
	id: string;
	name: string;
	description: string;
	url: string;
	/** Set when the project is archived. */
	archivedAt: string | null;
	status: { id: string; name: string; type: string };
	teams: { nodes: Array<{ id: string; key: string }> };
}

/** A project status: Linear's fixed set is backlog, planned, started, paused, completed, canceled. */
export interface LinearProjectStatus {
	id: string;
	name: string;
	type: string;
}

/** A link attached to an issue; a migration records the source issue's address this way. */
export interface LinearAttachment {
	id: string;
	url: string;
	title: string;
	issue: { id: string; identifier: string };
}
