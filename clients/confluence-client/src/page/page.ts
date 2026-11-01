import type { RestClient } from "@theholocron/http-client";

/** Reads (`get`) and updates (`update`) Confluence pages by id; the response is typed as `T`. */
export function page(rest: RestClient) {
	return {
		get: <T = unknown>(id: string): Promise<T> => rest.request<T>(`/${id}`),

		update: <T = unknown>(id: string, data: Record<string, unknown>): Promise<T> =>
			rest.request<T>(`/${id}`, { method: "PUT", body: data }),
	};
}
