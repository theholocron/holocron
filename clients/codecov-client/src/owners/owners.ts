import type { CodecovService } from "../repos/repos.js";
import type { RestClient } from "../utils.js";

/** An owner (a user or organization) as Codecov reports it. Only the fields Holocron reads are typed. */
export interface CodecovOwner {
	/** The owner's login on the service. */
	username: string;
	/** The service the owner is on. */
	service?: string;
	/** The owner's display name. */
	name?: string;
}

/** The `owners` group of the Codecov client. */
export function owners(rest: RestClient) {
	return {
		/** Get one owner: `GET /{service}/{owner}/`. */
		get: (service: CodecovService, owner: string): Promise<CodecovOwner> =>
			rest.request<CodecovOwner>(`/${service}/${encodeURIComponent(owner)}/`),
	};
}
