import { cfRequest, type RestClient } from "../utils.js";

export interface CfZone {
	id: string;
	name: string;
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
