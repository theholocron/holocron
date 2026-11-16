import type { GitHubIssueField, GitHubIssueFieldValue } from "@theholocron/github-client";

/** A request the fake answered: what the issue-field calls of a test did. */
export interface FieldCall {
	method: string;
	path: string;
	body?: unknown;
}

/** The Priority field of an organization that has one, with ids as GitHub gives them. */
export const PRIORITY_FIELD: GitHubIssueField = {
	id: 30633742,
	name: "Priority",
	data_type: "single_select",
	options: [
		{ id: 1, name: "Urgent" },
		{ id: 2, name: "High" },
		{ id: 3, name: "Medium" },
		{ id: 4, name: "Low" },
	],
};

/** What a test sets up about the issue fields: the organization's fields, and an issue's values by issue number. */
export interface FakeIssueFields {
	fields?: GitHubIssueField[] | Response;
	values?: Record<number, GitHubIssueFieldValue[]>;
	/** Answers a write with this status (default 200 for a POST, 204 for a DELETE). */
	writeStatus?: number;
}

const json = (body: unknown, status = 200) =>
	new Response(status === 204 ? null : JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

/**
 * Wraps a fetch so that the organization's issue-field list and an issue's issue-field values are answered here, and
 * everything else goes on to the wrapped fetch (the queue of a `stubFetch`). The org has no fields unless the test says.
 */
export function withIssueFields(inner: typeof fetch, setup: FakeIssueFields = {}) {
	const calls: FieldCall[] = [];
	const fake: typeof fetch = async (input, init) => {
		const url = new URL(String(input));
		const method = init?.method ?? "GET";
		if (!/\/issue-fields$|\/issue-field-values/.test(url.pathname)) return inner(input, init);
		calls.push({ method, path: url.pathname, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
		if (url.pathname.endsWith("/issue-fields")) {
			return setup.fields instanceof Response ? setup.fields : json(setup.fields ?? []);
		}
		if (method === "GET") return json(setup.values?.[Number(/issues\/(\d+)\//.exec(url.pathname)![1])] ?? []);
		return method === "DELETE" ? json(null, setup.writeStatus ?? 204) : json([], setup.writeStatus ?? 200);
	};
	return { fetch: fake, calls };
}
