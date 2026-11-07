/* v8 ignore file -- test fixtures */
import { createLinearClient } from "@theholocron/linear-client";

import { createTeamScope } from "./capabilities/team-scope.js";

type Handler = (variables: Record<string, unknown>) => unknown;

/** One GraphQL request the fake received. */
export interface Call {
	document: string;
	variables: Record<string, unknown>;
}

/**
 * A `fetch` standing in for Linear: each request is answered by the first handler whose pattern matches the GraphQL
 * document, and an unmatched request fails the test by name.
 */
export function fakeLinear(routes: Array<[RegExp, Handler | unknown]>) {
	const calls: Call[] = [];
	const fetch = (async (_url: string | URL, init?: RequestInit) => {
		const { query, variables } = JSON.parse(String(init?.body)) as {
			query: string;
			variables: Record<string, unknown>;
		};
		calls.push({ document: query, variables: variables ?? {} });
		const route = routes.find(([pattern]) => pattern.test(query));
		if (!route) return new Response(JSON.stringify({ errors: [{ message: `unrouted: ${query.slice(0, 60)}` }] }));
		const [, handler] = route;
		const data = typeof handler === "function" ? (handler as Handler)(variables ?? {}) : handler;
		return new Response(JSON.stringify({ data }));
	}) as typeof globalThis.fetch;
	return { fetch, calls, called: (pattern: RegExp) => calls.filter((c) => pattern.test(c.document)) };
}

/** A page of a connection. */
export const nodes = <T>(list: T[]) => ({ nodes: list, pageInfo: { hasNextPage: false, endCursor: null } });

export const TEAM = { id: "team1", key: "ENG", name: "Engineering" };

export const STATES = [
	{ id: "s-backlog", name: "Backlog", type: "backlog", color: "#000", position: 0 },
	{ id: "s-todo", name: "Todo", type: "unstarted", color: "#000", position: 1 },
	{ id: "s-prog", name: "In Progress", type: "started", color: "#000", position: 2 },
	{ id: "s-review", name: "In Review", type: "started", color: "#000", position: 3 },
	{ id: "s-done", name: "Done", type: "completed", color: "#000", position: 4 },
	{ id: "s-cancel", name: "Canceled", type: "canceled", color: "#000", position: 5 },
];

/** A Linear issue as the API returns it, with overrides. */
export function issue(over: Record<string, unknown> = {}) {
	return {
		id: "i1",
		identifier: "ENG-1",
		number: 1,
		title: "Do the thing",
		description: "body",
		priority: 2,
		priorityLabel: "High",
		estimate: null,
		dueDate: null,
		url: "https://linear.app/acme/issue/ENG-1",
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-02T00:00:00Z",
		completedAt: null,
		canceledAt: null,
		state: { id: "s-todo", name: "Todo", type: "unstarted" },
		team: { id: "team1", key: "ENG" },
		assignee: null,
		labels: { nodes: [] },
		project: null,
		parent: null,
		relations: { nodes: [] },
		inverseRelations: { nodes: [] },
		...over,
	};
}

/** A scope over a fake, with the team and its states already routed. */
export function scopeWith(routes: Array<[RegExp, Handler | unknown]>) {
	const fake = fakeLinear([
		...routes,
		[/teams\(first/, { teams: nodes([TEAM]) }],
		[/workflowStates\(first/, { workflowStates: nodes(STATES) }],
	]);
	const client = createLinearClient({ token: "lin_api_x", fetch: fake.fetch });
	return { ...fake, scope: createTeamScope(client, "ENG") };
}
