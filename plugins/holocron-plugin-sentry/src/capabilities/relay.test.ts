import type { SentryApp, SentryAppInput, SentryWorkflow, SentryWorkflowInput } from "@theholocron/sentry-client";
import { describe, expect, it, vi } from "vitest";

import type { SentryClient } from "../rest.js";
import { ensureSentryRelay } from "./relay.js";

const ORG = "my-org";
const WEBHOOK = "https://discord.example/api/webhooks/1/token";
const input = {
	name: "Comlink",
	webhookUrl: WEBHOOK,
	projects: ["holocron-cli"],
	rule: { name: "Errors to Discord (Comlink)" },
};

const app = (over: Partial<SentryApp> = {}): SentryApp => ({
	name: "Comlink",
	slug: "comlink-1",
	uuid: "u1",
	status: "internal",
	scopes: ["event:read"],
	webhookUrl: WEBHOOK,
	isAlertable: true,
	clientSecret: "shh",
	...over,
});

const workflow = (over: Partial<SentryWorkflow> = {}): SentryWorkflow => ({
	id: "w1",
	name: input.rule.name,
	enabled: true,
	environment: null,
	config: { frequency: 5 },
	detectorIds: ["d1"],
	triggers: {
		id: "t",
		logicType: "any-short",
		conditions: [{ id: "c", type: "new_high_priority_issue", comparison: true, conditionResult: true }],
	},
	actionFilters: [
		{
			id: "f",
			logicType: "all",
			conditions: [],
			actions: [
				{ id: "a", type: "sentry_app", config: { targetType: "sentry_app", targetIdentifier: "42" }, data: {} },
			],
		},
	],
	...over,
});

interface World {
	apps?: SentryApp[];
	workflows?: SentryWorkflow[];
	detectors?: Array<{ id: string; projectId: string | null; name: string; type: string; workflowIds: string[] }>;
	installs?: Array<{ uuid: string; status: string; app: { uuid: string; slug: string; sentryAppId: number } }>;
	created?: SentryApp;
	got?: SentryApp;
}

function world(w: World = {}) {
	const client = {
		sentryApps: {
			list: vi.fn(async () => w.apps ?? []),
			create: vi.fn(async () => w.created ?? app()),
			update: vi.fn(async (_slug: string, _body: SentryAppInput) => app()),
			get: vi.fn(async () => w.got ?? app()),
			installations: vi.fn(
				async () =>
					w.installs ?? [
						{ uuid: "i", status: "installed", app: { uuid: "u1", slug: "comlink-1", sentryAppId: 42 } },
					]
			),
		},
		workflows: {
			list: vi.fn(async () => w.workflows ?? []),
			create: vi.fn(async (_org: string, _body: SentryWorkflowInput) => workflow()),
			update: vi.fn(async (_org: string, _id: string, _body: SentryWorkflowInput) => workflow()),
			detectors: vi.fn(
				async () =>
					w.detectors ?? [{ id: "d1", projectId: "p1", name: "x", type: "issue_stream", workflowIds: [] }]
			),
		},
		projects: { list: vi.fn(async () => [{ id: "p1", slug: "holocron-cli", name: "x", platform: "node" }]) },
	};
	return { client, as: client as unknown as SentryClient };
}

describe("ensureSentryRelay", () => {
	it("creates the integration and the rule, and returns the secret it reads back", async () => {
		const { client, as } = world({
			created: app({ clientSecret: undefined }),
			got: app({ clientSecret: "from-get" }),
		});
		const result = await ensureSentryRelay(as, ORG, input);
		expect(result).toEqual({
			integration: { created: true, updated: [] },
			rule: { created: true, updated: [] },
			clientSecret: "from-get",
		});
		expect(client.sentryApps.create).toHaveBeenCalledWith(ORG, {
			name: "Comlink",
			scopes: ["event:read"],
			webhookUrl: WEBHOOK,
			isAlertable: true,
		});
		const body = client.workflows.create.mock.calls[0]![1];
		expect(body.detectorIds).toEqual(["d1"]);
		expect(body.actionFilters[0]!.actions[0]).toMatchObject({
			type: "sentry_app",
			config: { targetIdentifier: "42" },
		});
	});

	it("leaves everything alone when it is already right", async () => {
		const { client, as } = world({ apps: [app()], workflows: [workflow()] });
		const result = await ensureSentryRelay(as, ORG, input);
		expect(result).toMatchObject({
			integration: { created: false, updated: [] },
			rule: { created: false, updated: [] },
			clientSecret: "shh",
		});
		expect(client.sentryApps.update).not.toHaveBeenCalled();
		expect(client.workflows.update).not.toHaveBeenCalled();
	});

	it("omits the secret when the token cannot see it", async () => {
		const { as } = world({
			apps: [app({ clientSecret: undefined })],
			got: app({ clientSecret: "" }),
			workflows: [workflow()],
		});
		expect(await ensureSentryRelay(as, ORG, input)).not.toHaveProperty("clientSecret");
	});

	it("adds event:read when an adopted integration lacks it", async () => {
		const { client, as } = world({ apps: [app({ scopes: ["org:read"] })], workflows: [workflow()] });
		const result = await ensureSentryRelay(as, ORG, input);
		expect(result.integration.updated).toEqual(["scopes"]);
		expect(client.sentryApps.update.mock.calls[0]![1].scopes).toEqual(["org:read", "event:read"]);
	});

	it("repoints the webhook and turns the alert action on, keeping the scopes", async () => {
		const { client, as } = world({
			apps: [app({ webhookUrl: "https://old", isAlertable: false, scopes: ["event:read", "org:read"] })],
			workflows: [workflow()],
		});
		const result = await ensureSentryRelay(as, ORG, input);
		expect(result.integration.updated).toEqual(["webhook URL", "alert action"]);
		expect(client.sentryApps.update).toHaveBeenCalledWith("comlink-1", {
			name: "Comlink",
			scopes: ["event:read", "org:read"],
			webhookUrl: WEBHOOK,
			isAlertable: true,
		});
	});

	it("adopts a rule that was changed: enables it, attaches the project, adds the action", async () => {
		const stale = workflow({
			enabled: false,
			detectorIds: ["other"],
			actionFilters: [
				{
					id: "f",
					logicType: "all",
					conditions: [{ id: "fc", type: "level", comparison: { level: 40 }, conditionResult: true }],
					actions: [],
				},
			],
		});
		const { client, as } = world({ apps: [app()], workflows: [stale] });
		const result = await ensureSentryRelay(as, ORG, input);
		expect(result.rule).toEqual({ created: false, updated: ["enabled", "projects", "action"] });
		const [, id, body] = client.workflows.update.mock.calls[0]!;
		expect(id).toBe("w1");
		expect(body.enabled).toBe(true);
		expect(body.detectorIds).toEqual(["other", "d1"]);
		expect(body.actionFilters[1]!.actions).toHaveLength(1);
		expect(body.actionFilters[0]!.conditions).toEqual([
			{ type: "level", comparison: { level: 40 }, conditionResult: true },
		]);
		expect(JSON.stringify(body)).not.toContain('"id"');
	});

	it("sets the frequency only when the layout gives one", async () => {
		const { client, as } = world({ apps: [app()], workflows: [workflow()] });
		await ensureSentryRelay(as, ORG, input);
		expect(client.workflows.update).not.toHaveBeenCalled();
		const result = await ensureSentryRelay(as, ORG, { ...input, rule: { ...input.rule, frequency: 30 } });
		expect(result.rule.updated).toEqual(["frequency"]);
		expect(client.workflows.update.mock.calls[0]![2].config).toEqual({ frequency: 30 });
	});

	it("puts the action on a filter without conditions, not a narrower one", async () => {
		const narrow = {
			id: "f",
			logicType: "all",
			conditions: [{ id: "fc", type: "level", comparison: { level: 40 }, conditionResult: true }],
			actions: [],
		};
		const { client, as } = world({ apps: [app()], workflows: [workflow({ actionFilters: [narrow] })] });
		await ensureSentryRelay(as, ORG, input);
		const filters = client.workflows.update.mock.calls[0]![2].actionFilters;
		expect(filters).toHaveLength(2);
		expect(filters[0]!.actions).toHaveLength(0);
		expect(filters[1]).toMatchObject({ conditions: [], actions: [{ type: "sentry_app" }] });
	});

	it("reuses a filter without conditions for the action", async () => {
		const open = { id: "f", logicType: "all", conditions: [], actions: [] };
		const { client, as } = world({ apps: [app()], workflows: [workflow({ actionFilters: [open] })] });
		await ensureSentryRelay(as, ORG, input);
		const filters = client.workflows.update.mock.calls[0]![2].actionFilters;
		expect(filters).toHaveLength(1);
		expect(filters[0]!.actions).toHaveLength(1);
	});

	it("changes nothing when a project is wrong", async () => {
		const { client, as } = world({ apps: [app({ webhookUrl: "https://old" })] });
		await expect(ensureSentryRelay(as, ORG, { ...input, projects: ["nope"] })).rejects.toThrow(/not found/);
		expect(client.sentryApps.update).not.toHaveBeenCalled();
		expect(client.sentryApps.create).not.toHaveBeenCalled();
	});

	it("adds a filter for the action when the rule has none", async () => {
		const { client, as } = world({ apps: [app()], workflows: [workflow({ actionFilters: [] })] });
		await ensureSentryRelay(as, ORG, input);
		expect(client.workflows.update.mock.calls[0]![2].actionFilters).toHaveLength(1);
	});

	it("says which part is missing", async () => {
		await expect(ensureSentryRelay(world().as, ORG, { ...input, projects: [] })).rejects.toThrow(/at least one/);
		await expect(ensureSentryRelay(world().as, ORG, { ...input, projects: ["nope"] })).rejects.toThrow(
			/`nope` was not found/
		);
		await expect(ensureSentryRelay(world({ detectors: [] }).as, ORG, input)).rejects.toThrow(
			/no issue stream detector/
		);
		await expect(ensureSentryRelay(world({ installs: [] }).as, ORG, input)).rejects.toThrow(/not installed/);
	});
});
