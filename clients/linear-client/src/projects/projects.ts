import { type Connection, type LinearGraphQL, paginate } from "../graphql/graphql.js";
import type { LinearProject, LinearProjectStatus } from "../types.js";

const PROJECT_FIELDS = "id name description url archivedAt status { id name type } teams { nodes { id key } }";

/** Projects, Linear's boards of work. */
export function projects(gql: LinearGraphQL) {
	return {
		/** Every project, archived ones included. */
		async list(): Promise<LinearProject[]> {
			return paginate((after) =>
				gql
					.query<{ projects: Connection<LinearProject> }>(
						`query($after: String) { projects(first: 100, after: $after, includeArchived: true) {
							nodes { ${PROJECT_FIELDS} } pageInfo { hasNextPage endCursor } } }`,
						{ after }
					)
					.then((d) => d.projects)
			);
		},

		/** The project's statuses (Backlog, Planned, In Progress, Completed, Canceled, ...). */
		async statuses(): Promise<LinearProjectStatus[]> {
			const data = await gql.query<{ projectStatuses: Connection<LinearProjectStatus> }>(
				`query { projectStatuses(first: 50) { nodes { id name type } pageInfo { hasNextPage endCursor } } }`
			);
			return data.projectStatuses.nodes;
		},

		/** Makes a project for the given teams. */
		async create(input: {
			name: string;
			teamIds: string[];
			description?: string;
			statusId?: string;
		}): Promise<LinearProject> {
			const data = await gql.query<{ projectCreate: { project: LinearProject } }>(
				`mutation($input: ProjectCreateInput!) { projectCreate(input: $input) { project { ${PROJECT_FIELDS} } } }`,
				{ input }
			);
			return data.projectCreate.project;
		},

		/** Archives the project. Reversible with `unarchive`. */
		async archive(id: string): Promise<void> {
			await gql.query(`mutation($id: String!) { projectArchive(id: $id) { success } }`, { id });
		},

		/** Brings an archived project back. */
		async unarchive(id: string): Promise<void> {
			await gql.query(`mutation($id: String!) { projectUnarchive(id: $id) { success } }`, { id });
		},
	};
}
