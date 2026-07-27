import { collections } from "./collections/collections.js";
import { environments } from "./environments/environments.js";
import { importApi } from "./import/import.js";
import { me } from "./me/me.js";
import { specs } from "./specs/specs.js";
import { createPostmanRestClient, type PostmanClientOptions } from "./utils.js";
import { workspaces } from "./workspaces/workspaces.js";

export type {
	PostmanCollection,
	PostmanCollectionsResponse,
} from "./collections/collections.js";
export type {
	PostmanEnvironment,
	PostmanEnvironmentResponse,
	PostmanEnvironmentsResponse,
} from "./environments/environments.js";
export { detectPlanLimit, PostmanPlanLimitError } from "./errors.js";
export type { PostmanImportOpenApiResponse } from "./import/import.js";
export type { PostmanMeResponse, PostmanUser } from "./me/me.js";
export type {
	PostmanCreateSpecInput,
	PostmanSpec,
	PostmanSpecsResponse,
} from "./specs/specs.js";
export type { PostmanClientOptions } from "./utils.js";
export type {
	PostmanWorkspace,
	PostmanWorkspacesResponse,
} from "./workspaces/workspaces.js";

export function createPostmanClient(opts: PostmanClientOptions) {
	const rest = createPostmanRestClient(opts);
	return {
		collections: collections(rest),
		environments: environments(rest),
		import: importApi(rest),
		me: me(rest),
		specs: specs(rest),
		workspaces: workspaces(rest),
	};
}

export type PostmanClient = ReturnType<typeof createPostmanClient>;
