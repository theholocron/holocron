import type { JiraClientOptions } from "./types.js";

export function buildHeaders(token: string): Record<string, string> {
	return {
		Accept: "application/json",
		Authorization: `Basic ${token}`,
		"Content-Type": "application/json; charset=UTF-8",
	};
}

export function buildUrl(options: JiraClientOptions, path: string, params?: Record<string, unknown>): string {
	const url = new URL(`${options.host}${path}`);
	if (params) {
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined) {
				url.searchParams.set(key, String(value));
			}
		}
	}
	return url.toString();
}

export async function request<T>(url: string, init: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	if (!response.ok) {
		throw new Error(`Jira API error ${response.status}: ${response.statusText}`);
	}
	if (response.status === 204 || response.headers.get("content-length") === "0") {
		return undefined as T;
	}
	return response.json() as Promise<T>;
}
