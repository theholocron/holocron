import type { RestClient } from "@theholocron/http-client";

export function page(rest: RestClient) {
	return {
		get: <T = unknown>(id: string): Promise<T> =>
			rest.request<T>(`/${id}`),

		update: <T = unknown>(id: string, data: Record<string, unknown>): Promise<T> =>
			rest.request<T>(`/${id}`, { method: "PUT", body: data }),
	};
}
