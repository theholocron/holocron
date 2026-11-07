import { type Connection, type LinearGraphQL, paginate } from "../graphql/graphql.js";
import type {
	LinearLabel,
	LinearStateType,
	LinearTeam,
	LinearTeamAutomation,
	LinearUser,
	LinearWorkflowState,
} from "../types.js";

const USER_FIELDS = "id name displayName email";

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
			const data = await gql.query<{ team: LinearTeamAutomation }>(
				`query($id: String!) { team(id: $id) { autoArchivePeriod autoClosePeriod autoCloseState { id name } triageEnabled } }`,
				{ id: teamId }
			);
			return data.team;
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
