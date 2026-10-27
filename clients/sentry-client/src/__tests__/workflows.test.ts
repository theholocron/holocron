import { describe, expect, it } from "vitest";

import { createSentryClient, type SentryWorkflowInput } from "../index.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://sentry.test/api/0";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return {
		workflows: createSentryClient({ token: "tok", baseUrl: BASE, fetch }).workflows,
		calls,
	};
}

const input: SentryWorkflowInput = {
	name: "Errors to Discord (Comlink)",
	enabled: true,
	environment: null,
	config: { frequency: 5 },
	detectorIds: ["7919365"],
	triggers: {
		logicType: "any-short",
		conditions: [
			{
				type: "new_high_priority_issue",
				comparison: true,
				conditionResult: true,
			},
		],
	},
	actionFilters: [
		{
			logicType: "all",
			conditions: [],
			actions: [
				{
					type: "sentry_app",
					config: {
						targetType: "sentry_app",
						targetIdentifier: "184160",
					},
					data: {},
				},
			],
		},
	],
};

describe("workflows", () => {
	it("lists, gets, creates and replaces alert rules under the organization", async () => {
		const wf = { ...input, id: "6236202" };
		const { workflows, calls } = client([{ body: [wf] }, { body: wf }, { status: 201, body: wf }, { body: wf }]);
		expect(await workflows.list("org")).toEqual([wf]);
		expect((await workflows.get("org", "6236202")).id).toBe("6236202");
		await workflows.create("org", input);
		await workflows.update("org", "6236202", input);
		expect(calls.map((c) => [c.method, c.url])).toEqual([
			["GET", `${BASE}/organizations/org/workflows/`],
			["GET", `${BASE}/organizations/org/workflows/6236202/`],
			["POST", `${BASE}/organizations/org/workflows/`],
			["PUT", `${BASE}/organizations/org/workflows/6236202/`],
		]);
		expect(calls[2]?.body).toEqual(input);
		expect(calls[3]?.body).toEqual(input);
	});

	it("lists the detectors a workflow attaches to", async () => {
		const det = {
			id: "7919365",
			projectId: "4511810950791168",
			name: "Issue Stream",
			type: "issue_stream",
			workflowIds: [],
		};
		const { workflows, calls } = client([{ body: [det] }]);
		expect(await workflows.detectors("org")).toEqual([det]);
		expect(calls[0]?.url).toBe(`${BASE}/organizations/org/detectors/`);
	});

	it("encodes the organization and id in the path", async () => {
		const { workflows, calls } = client([{ body: [] }, { body: {} }]);
		await workflows.list("a/b?c");
		await workflows.get("org", "1/../2");
		expect(calls[0]?.url).toBe(`${BASE}/organizations/a%2Fb%3Fc/workflows/`);
		expect(calls[1]?.url).toBe(`${BASE}/organizations/org/workflows/1%2F..%2F2/`);
	});
});
