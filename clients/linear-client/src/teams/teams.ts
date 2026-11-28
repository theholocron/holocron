import { type Connection, type LinearGraphQL, paginate } from "../graphql/graphql.js";
import type {
	LinearGitAutomationState,
	LinearGitEvent,
	LinearGitTargetBranch,
	LinearLabel,
	LinearStateType,
	LinearTeam,
	LinearTeamAutomation,
	LinearUser,
	LinearWorkflowState,
} from "../types.js";

const USER_FIELDS = "id name displayName email";

/**
 * A team's automation settings as Linear sends them: the close state is an id (`Team` has no `autoCloseState` field,
 * only `autoCloseStateId`), so the team's states come with it to give the id a name.
 */
const AUTOMATION_FIELDS =
	"autoArchivePeriod autoClosePeriod autoCloseStateId triageEnabled states(first: 100) { nodes { id name } }";

interface AutomationWire extends Omit<LinearTeamAutomation, "autoCloseState"> {
	autoCloseStateId: string | null;
	states: { nodes: Array<{ id: string; name: string }> };
}

/** The public shape of a team's automation: the close state with its name, found among the team's states. */
function toAutomation({ autoCloseStateId, states, ...rest }: AutomationWire): LinearTeamAutomation {
	const autoCloseState =
		autoCloseStateId === null
			? null
			: (states.nodes.find((s) => s.id === autoCloseStateId) ?? { id: autoCloseStateId, name: autoCloseStateId });
	return { ...rest, autoCloseState };
}

/** Identity, teams, workflow states, labels and automation settings. */
export function teams(gql: LinearGraphQL) {
	return {
		/** The user the token belongs to, and the workspace. */
		async viewer(): Promise<{ user: LinearUser; organization: { id: string; name: string; urlKey: string } }> {
			const data = await gql.query<{
				viewer: LinearUser;
				organization: { id: string; name: string; urlKey: string };
			}>(`query { viewer { ${USER_FIELDS} } organization { id name urlKey } }`);
			return { user: data.viewer, organization: data.organization };
		},

		/** Every team the token can see. */
		async list(): Promise<LinearTeam[]> {
			return paginate((after) =>
				gql
					.query<{ teams: Connection<LinearTeam> }>(
						`query($after: String) { teams(first: 100, after: $after) { nodes { id key name } pageInfo { hasNextPage endCursor } } }`,
						{ after }
					)
					.then((d) => d.teams)
			);
		},

		/** A team by its key (`ENG`), name or id, or undefined. */
		async find(ref: string): Promise<LinearTeam | undefined> {
			const all = await this.list();
			const lower = ref.toLowerCase();
			return all.find((t) => t.id === ref || t.key.toLowerCase() === lower || t.name.toLowerCase() === lower);
		},

		/** The team's archive and close settings, which are the automation Linear exposes. */
		async automation(teamId: string): Promise<LinearTeamAutomation> {
			const data = await gql.query<{ team: AutomationWire }>(
				`query($id: String!) { team(id: $id) { ${AUTOMATION_FIELDS} } }`,
				{ id: teamId }
			);
			return toAutomation(data.team);
		},

		/**
		 * Changes the team's auto-archive and auto-close settings (`teamUpdate`); a field left out is left alone, a null
		 * `autoClosePeriod` switches auto-close off and a 0 `autoArchivePeriod` switches auto-archive off. Needs a key
		 * with admin access to the team.
		 */
		async updateAutomation(
			teamId: string,
			input: { autoArchivePeriod?: number; autoClosePeriod?: number | null; autoCloseStateId?: string }
		): Promise<LinearTeamAutomation> {
			const data = await gql.query<{ teamUpdate: { team: AutomationWire } }>(
				`mutation($id: String!, $input: TeamUpdateInput!) { teamUpdate(id: $id, input: $input) { team {
					${AUTOMATION_FIELDS} } } }`,
				{ id: teamId, input }
			);
			return toAutomation(data.teamUpdate.team);
		},

		/** The team's git automation rules (`gitAutomationStates`), each with the state and target branch it names. */
		async gitAutomation(teamId: string): Promise<LinearGitAutomationState[]> {
			return paginate((after) =>
				gql
					.query<{ team: { gitAutomationStates: Connection<LinearGitAutomationState> } }>(
						`query($id: String!, $after: String) { team(id: $id) { gitAutomationStates(first: 100, after: $after) {
							nodes { id event state { id name } targetBranch { id branchPattern isRegex } }
							pageInfo { hasNextPage endCursor } } } }`,
						{ id: teamId, after }
					)
					.then((d) => d.team.gitAutomationStates)
			);
		},

		/** Makes a target branch for the team (`gitAutomationTargetBranchCreate`); an exact name unless `isRegex`. */
		async createGitTargetBranch(input: {
			teamId: string;
			branchPattern: string;
			isRegex?: boolean;
		}): Promise<LinearGitTargetBranch> {
			const data = await gql.query<{ gitAutomationTargetBranchCreate: { targetBranch: LinearGitTargetBranch } }>(
				`mutation($input: GitAutomationTargetBranchCreateInput!) { gitAutomationTargetBranchCreate(input: $input) {
					targetBranch { id branchPattern isRegex } } }`,
				{ input }
			);
			return data.gitAutomationTargetBranchCreate.targetBranch;
		},

		/** Makes a git automation rule (`gitAutomationStateCreate`); without `targetBranchId` it applies to all branches. */
		async createGitAutomation(input: {
			teamId: string;
			event: LinearGitEvent;
			stateId: string;
			targetBranchId?: string;
		}): Promise<LinearGitAutomationState> {
			const data = await gql.query<{
				gitAutomationStateCreate: { gitAutomationState: LinearGitAutomationState };
			}>(
				`mutation($input: GitAutomationStateCreateInput!) { gitAutomationStateCreate(input: $input) {
					gitAutomationState { id event state { id name } targetBranch { id branchPattern isRegex } } } }`,
				{ input }
			);
			return data.gitAutomationStateCreate.gitAutomationState;
		},

		/** Points an existing git automation rule at another state (`gitAutomationStateUpdate`). */
		async updateGitAutomation(id: string, input: { stateId: string }): Promise<LinearGitAutomationState> {
			const data = await gql.query<{
				gitAutomationStateUpdate: { gitAutomationState: LinearGitAutomationState };
			}>(
				`mutation($id: String!, $input: GitAutomationStateUpdateInput!) { gitAutomationStateUpdate(id: $id, input: $input) {
					gitAutomationState { id event state { id name } targetBranch { id branchPattern isRegex } } } }`,
				{ id, input }
			);
			return data.gitAutomationStateUpdate.gitAutomationState;
		},

		/** The team's issue statuses, in board order. */
		async states(teamId: string): Promise<LinearWorkflowState[]> {
			const all = await paginate((after) =>
				gql
					.query<{ workflowStates: Connection<LinearWorkflowState> }>(
						`query($team: ID!, $after: String) { workflowStates(first: 100, after: $after, filter: { team: { id: { eq: $team } } }) {
							nodes { id name type color description position } pageInfo { hasNextPage endCursor } } }`,
						{ team: teamId, after }
					)
					.then((d) => d.workflowStates)
			);
			return all.sort((a, b) => a.position - b.position);
		},

		/** Adds a status to the team's workflow. */
		async createState(
			teamId: string,
			input: { name: string; type: LinearStateType; color?: string; description?: string }
		): Promise<LinearWorkflowState> {
			const data = await gql.query<{ workflowStateCreate: { workflowState: LinearWorkflowState } }>(
				`mutation($input: WorkflowStateCreateInput!) { workflowStateCreate(input: $input) {
					workflowState { id name type color description position } } }`,
				{ input: { teamId, color: "#95a2b3", ...input } }
			);
			return data.workflowStateCreate.workflowState;
		},

		/** Labels of the team and the workspace-wide ones. */
		async labels(teamId?: string): Promise<LinearLabel[]> {
			return paginate((after) =>
				gql
					.query<{ issueLabels: Connection<LinearLabel> }>(
						`query($after: String, $filter: IssueLabelFilter) { issueLabels(first: 100, after: $after, filter: $filter) {
							nodes { id name color team { id } } pageInfo { hasNextPage endCursor } } }`,
						{
							after,
							filter: teamId
								? { or: [{ team: { id: { eq: teamId } } }, { team: { null: true } }] }
								: undefined,
						}
					)
					.then((d) => d.issueLabels)
			);
		},

		/** Makes a label; without `teamId` it is workspace-wide. */
		async createLabel(input: { name: string; color?: string; teamId?: string }): Promise<LinearLabel> {
			const data = await gql.query<{ issueLabelCreate: { issueLabel: LinearLabel } }>(
				`mutation($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { issueLabel { id name color team { id } } } }`,
				{ input }
			);
			return data.issueLabelCreate.issueLabel;
		},

		/** Every active member of the workspace. */
		async users(): Promise<LinearUser[]> {
			return paginate((after) =>
				gql
					.query<{ users: Connection<LinearUser> }>(
						`query($after: String) { users(first: 100, after: $after) { nodes { ${USER_FIELDS} } pageInfo { hasNextPage endCursor } } }`,
						{ after }
					)
					.then((d) => d.users)
			);
		},
	};
}
