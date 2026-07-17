import { createNeonRestClient, type NeonClientOptions } from "./utils.js";
import { branches } from "./branches/branches.js";
import { connection } from "./connection/connection.js";
import { databases } from "./databases/databases.js";
import { users } from "./users/users.js";

export type { NeonClientOptions } from "./utils.js";

export type {
	NeonBranch,
	NeonBranchesResponse,
	NeonBranchResponse,
	CreateNeonBranchInput,
} from "./branches/branches.js";
export type {
	NeonConnectionUriParams,
	NeonConnectionUriResponse,
} from "./connection/connection.js";
export type {
	NeonDatabase,
	NeonDatabasesResponse,
} from "./databases/databases.js";
export type { NeonMe } from "./users/users.js";

export function createNeonClient(opts: NeonClientOptions) {
	const rest = createNeonRestClient(opts);
	return {
		branches: branches(rest),
		connection: connection(rest),
		databases: databases(rest),
		users: users(rest),
	};
}

export type NeonClient = ReturnType<typeof createNeonClient>;
