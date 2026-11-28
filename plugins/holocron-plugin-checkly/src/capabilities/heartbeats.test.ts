import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createChecklyClient, DISCORD_TEMPLATE } from "../rest.js";
import { ChecklyMonitoring } from "./monitoring.js";

// An obviously fake address: a real ping URL is a credential.
const FAKE_PING = "https://ping.invalid/00000000-0000-0000-0000-000000000000";
const TOKEN = "11111111-1111-1111-1111-111111111111";

function make(
	responses: Array<{ status?: number; body?: unknown }>,
	options: ConstructorParameters<typeof ChecklyMonitoring>[1] = {}
) {
	const stub = stubFetch(responses);
	const client = createChecklyClient({ token: "t", accountId: "acct-1", fetch: stub.fetch });
	return { capability: new ChecklyMonitoring(() => client, options), stub };
}

const input = {
	name: "check-tokens",
	period: 1,
	periodUnit: "days" as const,
	grace: 2,
	graceUnit: "hours" as const,
};

const held = (over: Record<string, unknown> = {}, hb: Record<string, unknown> = {}) => ({
	id: "hb-1",
	name: "check-tokens",
	checkType: "HEARTBEAT",
	activated: true,
	tags: [],
	heartbeat: {
		period: 1,
		periodUnit: "days",
		grace: 2,
		graceUnit: "hours",
		pingToken: TOKEN,
		pingUrl: FAKE_PING,
		...hb,
	},
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: null,
	...over,
});

describe("ChecklyMonitoring heartbeats", () => {
	it("exposes the heartbeats it was configured with, empty by default", () => {
		expect(make([], { heartbeats: [input] }).capability.heartbeats).toEqual([input]);
		expect(make([]).capability.heartbeats).toEqual([]);
	});

	describe("ensureHeartbeat", () => {
		it("creates a heartbeat when no exact name matches and returns the ping URL", async () => {
			const { capability, stub } = make([
				{ body: [held({ name: "check-tokens-extra" })] },
				{ status: 201, body: held() },
			]);
			const result = await capability.ensureHeartbeat({ ...input, tags: ["ci"] });
			expect(result).toEqual({
				heartbeat: { id: "hb-1", name: "check-tokens" },
				alreadyExists: false,
				pingUrl: FAKE_PING,
			});
			expect(stub.calls[1]?.method).toBe("POST");
			expect(new URL(stub.calls[1]!.url).pathname).toBe("/v1/checks/heartbeat");
			expect(stub.calls[1]?.body).toEqual({
				name: "check-tokens",
				tags: ["ci"],
				heartbeat: { period: 1, periodUnit: "days", grace: 2, graceUnit: "hours" },
			});
		});

		it("leaves a matching heartbeat alone and still returns its ping URL", async () => {
			const { capability, stub } = make([{ body: [held()] }]);
			const result = await capability.ensureHeartbeat(input);
			expect(result).toEqual({
				heartbeat: { id: "hb-1", name: "check-tokens" },
				alreadyExists: true,
				pingUrl: FAKE_PING,
			});
			expect(stub.calls).toHaveLength(1);
		});

		it("updates a heartbeat whose period differs, keeping its ping token so the URL holds", async () => {
			const { capability, stub } = make([{ body: [held({}, { period: 7 })] }, { body: held() }]);
			const result = await capability.ensureHeartbeat(input);
			expect(result.alreadyExists).toBe(true);
			expect(stub.calls[1]?.method).toBe("PUT");
			expect(new URL(stub.calls[1]!.url).pathname).toBe("/v1/checks/heartbeat/hb-1");
			expect(stub.calls[1]?.body).toEqual({
				name: "check-tokens",
				heartbeat: { period: 1, periodUnit: "days", grace: 2, graceUnit: "hours", pingToken: TOKEN },
			});
		});

		it("compares tags only when the config states them, and updates when they differ", async () => {
			const unchanged = make([{ body: [held({ tags: ["x"] })] }]);
			await unchanged.capability.ensureHeartbeat(input);
			expect(unchanged.stub.calls).toHaveLength(1);

			const same = make([{ body: [held({ tags: ["b", "a"] })] }]);
			await same.capability.ensureHeartbeat({ ...input, tags: ["a", "b"] });
			expect(same.stub.calls).toHaveLength(1);

			const changed = make([{ body: [held({ tags: ["a"] })] }, { body: held() }]);
			await changed.capability.ensureHeartbeat({ ...input, tags: ["a", "b"] });
			expect(changed.stub.calls[1]?.method).toBe("PUT");
		});

		it("omits pingUrl when Checkly returns none", async () => {
			const { capability } = make([{ body: [] }, { status: 201, body: held({}, { pingUrl: undefined }) }]);
			expect(await capability.ensureHeartbeat(input)).toEqual({
				heartbeat: { id: "hb-1", name: "check-tokens" },
				alreadyExists: false,
			});
		});

		it("never puts the ping URL in an error", async () => {
			const { capability } = make([{ body: [] }, { status: 400, body: { message: "bad" } }]);
			const err = await capability.ensureHeartbeat(input).catch((e: unknown) => e);
			expect(String((err as Error).message)).not.toContain(FAKE_PING);
		});
	});

	describe("listHeartbeats", () => {
		it("reads the account's heartbeats in the declared shape, without the ping URL", async () => {
			const { capability } = make([
				{ body: [{ id: "a", name: "api", checkType: "API" }, held({ tags: ["ci"] })] },
			]);
			const listed = await capability.listHeartbeats();
			expect(listed).toEqual([{ ...input, tags: ["ci"] }]);
			expect(JSON.stringify(listed)).not.toContain("ping");
		});
	});

	describe("alert channel subscription", () => {
		const webhook = (subscriptions: unknown[] = []) => ({
			id: 9,
			type: "WEBHOOK",
			config: {
				name: "Message to #uptime",
				url: "https://discord.com/api/webhooks/1/old",
				method: "POST",
				headers: [],
				queryParameters: [],
				template: DISCORD_TEMPLATE,
				webhookType: "WEBHOOK_DISCORD",
			},
			sendRecovery: true,
			sendFailure: true,
			sendDegraded: true,
			sslExpiry: false,
			sslExpiryThreshold: 30,
			autoSubscribe: false,
			subscriptions,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: null,
		});
		const sub = (checkId: string) => ({ id: 1, checkId, groupId: null, activated: true });
		const channel = { name: "Message to #uptime", format: "discord" as const };

		it("subscribes a heartbeat with the other checks, since Checkly lists it among them", async () => {
			const { capability, stub } = make([
				{ body: [webhook()] }, // channels
				{ body: [{ id: "api-1", name: "api", checkType: "API" }, held()] }, // checks
				{ body: webhook() }, // read
				{ body: sub("api-1") },
				{ body: sub("hb-1") },
				{ body: webhook([sub("api-1"), sub("hb-1")]) },
			]);
			const result = await capability.ensureAlertChannel(channel);
			expect(result.subscribed).toBe(2);
			const puts = stub.calls.filter((c) => c.method === "PUT").map((c) => c.body);
			expect(puts).toContainEqual({ checkId: "hb-1", activated: true });
		});

		it("does not subscribe a heartbeat that routes itself to another channel", async () => {
			const { capability, stub } = make([{ body: [webhook()] }, { body: [held()] }, { body: webhook() }], {
				heartbeats: [{ ...input, alertChannels: ["Somewhere else"] }],
			});
			const result = await capability.ensureAlertChannel(channel);
			expect(result.subscribed).toBe(0);
			expect(stub.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
		});
	});
});
