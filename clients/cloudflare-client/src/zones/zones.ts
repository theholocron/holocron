import { cfRequest, type RestClient } from "../utils.js";

/** A Cloudflare zone (a domain on the account). */
export interface CfZone {
	/** The zone's identifier. */
	id: string;
	/** The zone's domain name. */
	name: string;
	/** The zone's status, as Cloudflare reports it. */
	status: string;
}

export function zones(rest: RestClient) {
	return {
		list: (query?: { name?: string; per_page?: number }): Promise<CfZone[]> =>
			cfRequest<CfZone[]>(rest, "GET", "/zones", undefined, {
				...(query?.name ? { name: query.name } : {}),
				per_page: String(query?.per_page ?? 100),
			}),
	};
}
