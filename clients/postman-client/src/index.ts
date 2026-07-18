import { createPostmanRestClient, type PostmanClientOptions } from "./utils.js";
import { collections } from "./collections/collections.js";
import { environments } from "./environments/environments.js";
import { importApi } from "./import/import.js";
import { me } from "./me/me.js";
import { specs } from "./specs/specs.js";
import { workspaces } from "./workspaces/workspaces.js";

export type { PostmanClientOptions } from "./utils.js";
export { PostmanPlanLimitError, detectPlanLimit } from "./errors.js";

export type {
	PostmanCollection,
	PostmanCollectionsResponse,
} from "./collections/collections.js";
export type {
	PostmanEnvironment,
	PostmanEnvironmentsResponse,
	PostmanEnvironmentResponse,
} from "./environments/environments.js";
export type { PostmanImportOpenApiResponse } from "./import/import.js";
export type { PostmanUser, PostmanMeResponse } from "./me/me.js";
export type {
	PostmanSpec,
	PostmanSpecsResponse,
	PostmanCreateSpecInput,
} from "./specs/specs.js";
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
