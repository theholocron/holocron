/** The kinds of workflow state Linear groups its states into. */
export type LinearStateType = "triage" | "backlog" | "unstarted" | "started" | "completed" | "canceled";

/** Linear's priority: 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
export type LinearPriority = 0 | 1 | 2 | 3 | 4;

/** A person in the workspace. */
export interface LinearUser {
	/** Linear's id for the person. */
	id: string;
	/** The full name. */
	name: string;
	/** The name shown in the app. */
	displayName: string;
	/** The email address, when the key may read it. */
	email?: string;
}

/** A team, which owns issues, workflow states and their automation. */
export interface LinearTeam {
	/** Linear's id for the team. */
	id: string;
	/** The short key that prefixes the team's issue identifiers (`ENG`). */
	key: string;
	/** The team's name. */
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
	/** Linear's id for the state. */
	id: string;
	/** The state's name (`In Progress`). */
	name: string;
	/** The kind of state, which decides how it counts (started, completed, ...). */
	type: LinearStateType;
	/** The colour, as a hex string. */
	color: string;
	/** What the state means, when one was written. */
	description?: string | null;
	/** Where the state sits in the team's list; lower comes first. */
	position: number;
}

/** A label, workspace-wide (`team` null) or a team's. */
export interface LinearLabel {
	/** Linear's id for the label. */
	id: string;
	/** The label's name. */
	name: string;
	/** The colour, as a hex string. */
	color: string;
	/** The team that owns the label, or null for a workspace label. */
	team: { id: string } | null;
}

/** A thing named by its id and its name. */
export interface LinearNamedRef {
	/** Linear's id. */
	id: string;
	/** The name. */
	name: string;
}

/** A workflow state as an issue carries it. */
export interface LinearStateRef extends LinearNamedRef {
	/** The kind of state. */
	type: LinearStateType;
}

/** A team as an issue or project carries it. */
export interface LinearTeamRef {
	/** Linear's id for the team. */
	id: string;
	/** The team's key. */
	key: string;
}

/** The nodes of a connection, when only the list is asked for. */
export interface LinearNodes<T> {
	/** The items. */
	nodes: T[];
}

/** An issue named by its id and its identifier. */
export interface LinearIssueRef {
	/** Linear's id for the issue. */
	id: string;
	/** `ENG-42`. */
	identifier: string;
}

/** A relation from an issue to another: `type` is `blocks`, `duplicate`, `related` or `similar`. */
export interface LinearRelation {
	/** Linear's id for the relation. */
	id: string;
	/** The kind of relation. */
	type: string;
	/** The issue the relation points at. */
	relatedIssue: LinearIssueRef;
}

/** A relation that points at the issue; `issue` is the one it starts from, so for `blocks` it is the blocker. */
export interface LinearInverseRelation {
	/** Linear's id for the relation. */
	id: string;
	/** The kind of relation. */
	type: string;
	/** The issue the relation starts from, with its state so a blocker that is done can be told. */
	issue: LinearIssueRef & { state: Pick<LinearStateRef, "type"> };
}

/** An issue as Linear returns it. */
export interface LinearIssue {
	/** Linear's id for the issue. */
	id: string;
	/** `ENG-42`. */
	identifier: string;
	/** The number within the team (`42`). */
	number: number;
	/** The title. */
	title: string;
	/** The description in Markdown, or null when empty. */
	description: string | null;
	/** The priority, 0 (none) to 4 (low). */
	priority: LinearPriority;
	/** The priority as Linear words it (`High`). */
	priorityLabel: string;
	/** The estimate, in the team's scale. */
	estimate: number | null;
	/** The due date, `YYYY-MM-DD`. */
	dueDate: string | null;
	/** The issue's address in the app. */
	url: string;
	/** When the issue was created, ISO 8601. */
	createdAt: string;
	/** When the issue last changed, ISO 8601. */
	updatedAt: string;
	/** When the issue was completed, ISO 8601, or null. */
	completedAt: string | null;
	/** When the issue was canceled, ISO 8601, or null. */
	canceledAt: string | null;
	/** The workflow state the issue is in. */
	state: LinearStateRef;
	/** The team that owns the issue. */
	team: LinearTeamRef;
	/** Who it is assigned to. */
	assignee: LinearUser | null;
	/** The labels on the issue. */
	labels: LinearNodes<LinearNamedRef>;
	/** The project it belongs to. */
	project: LinearNamedRef | null;
	/** The parent issue, when it is a sub-issue. */
	parent: LinearIssueRef | null;
	/** Relations that start at this issue (it `blocks` the related one). */
	relations: LinearNodes<LinearRelation>;
	/** Relations that point at this issue (the `issue` of a `blocks` one blocks it). */
	inverseRelations: LinearNodes<LinearInverseRelation>;
}

/** A comment on an issue. */
export interface LinearComment {
	/** Linear's id for the comment. */
	id: string;
	/** The text in Markdown. */
	body: string;
	/** When it was written, ISO 8601. */
	createdAt: string;
	/** Who wrote it; null for a deleted user or an integration. */
	user: { id: string; name: string; displayName: string } | null;
}

/** What `issues.create` accepts. */
export interface LinearIssueCreate {
	/** The team the issue is made in. */
	teamId: string;
	/** The title. */
	title: string;
	/** The description in Markdown. */
	description?: string;
	/** The priority, 0 (none) to 4 (low). */
	priority?: LinearPriority;
	/** The workflow state; the team's default when left out. */
	stateId?: string;
	/** Who it is assigned to. */
	assigneeId?: string;
	/** The labels to put on it. */
	labelIds?: string[];
	/** The project to put it in. */
	projectId?: string;
	/** The parent issue, to make it a sub-issue. */
	parentId?: string;
	/** The estimate, in the team's scale. */
	estimate?: number;
	/** The due date, `YYYY-MM-DD`. */
	dueDate?: string;
	/** Backdates the issue, which a migration uses to keep the original date. */
	createdAt?: string;
}

/** What `issues.update` accepts; a field left out is left alone. */
export type LinearIssueUpdate = Partial<Omit<LinearIssueCreate, "teamId" | "createdAt">>;

/** What `issues.list` narrows by. */
export interface LinearIssueFilter {
	/** Only issues of this team. */
	teamId?: string;
	/** Only issues in this project. */
	projectId?: string;
	/** Only issues assigned to this person. */
	assigneeId?: string;
	/** Leave out issues that are completed or canceled. */
	openOnly?: boolean;
	/** Stop after this many issues. */
	limit?: number;
}

/** A project, Linear's board of work. */
export interface LinearProject {
	/** Linear's id for the project. */
	id: string;
	/** The project's name. */
	name: string;
	/** The short description. */
	description: string;
	/** The project's address in the app. */
	url: string;
	/** Set when the project is archived. */
	archivedAt: string | null;
	/** The project's status. */
	status: LinearProjectStatus;
	/** The teams the project belongs to. */
	teams: LinearNodes<LinearTeamRef>;
}

/** A project status: Linear's fixed set is backlog, planned, started, paused, completed, canceled. */
export interface LinearProjectStatus {
	/** Linear's id for the status. */
	id: string;
	/** The status's name. */
	name: string;
	/** The kind of status. */
	type: string;
}

/** A link attached to an issue; a migration records the source issue's address this way. */
export interface LinearAttachment {
	/** Linear's id for the attachment. */
	id: string;
	/** The address it links to. */
	url: string;
	/** The title shown beside the link. */
	title: string;
	/** The issue it is attached to. */
	issue: LinearIssueRef;
}
