import { describe, expect, it } from "vitest";

import { createChecklyClient, DISCORD_TEMPLATE } from "../index.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://checkly.test/v1";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const { alertChannels } = createChecklyClient({
		token: "tok",
		accountId: "acct-1",
		baseUrl: BASE,
		fetch,
	});
	return { alertChannels, calls };
}

const channel = (id: number) => ({
	id,
	type: "WEBHOOK" as const,
	config: {
		name: `c${id}`,
		url: "https://discord.com/api/webhooks/1/x",
		method: "POST",
	},
	sendRecovery: true,
	sendFailure: true,
	sendDegraded: false,
	sslExpiry: false,
	sslExpiryThreshold: 30,
	autoSubscribe: false,
	subscriptions: [],
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: null,
});

describe("alertChannels", () => {
	it("lists channels, 100 at a time", async () => {
		const { alertChannels, calls } = client([{ body: [channel(1)] }]);
		expect(await alertChannels.list()).toEqual([channel(1)]);
		expect(calls[0]?.url).toBe(`${BASE}/alert-channels?limit=100&page=1`);
		expect(calls[0]?.headers).toMatchObject({
			"x-checkly-account": "acct-1",
		});
	});

	it("reads every page until a short one", async () => {
		const full = Array.from({ length: 100 }, (_, i) => channel(i));
		const { alertChannels, calls } = client([{ body: full }, { body: [channel(100)] }]);
		expect(await alertChannels.list()).toHaveLength(101);
		expect(new URL(calls[1]!.url).searchParams.get("page")).toBe("2");
	});

	it("refuses a runaway listing", async () => {
		const full = Array.from({ length: 100 }, (_, i) => channel(i));
		const { alertChannels } = client([
			...Array.from({ length: 50 }, () => ({ body: full })),
			{ body: [channel(5000)] },
		]);
		await expect(alertChannels.list()).rejects.toThrow(/refusing to read them all/);
	});

	it("returns exactly 5000 channels without complaint", async () => {
		const full = Array.from({ length: 100 }, (_, i) => channel(i));
		const { alertChannels } = client([...Array.from({ length: 50 }, () => ({ body: full })), { body: [] }]);
		expect(await alertChannels.list()).toHaveLength(5000);
	});

	it("gets one channel", async () => {
		const { alertChannels, calls } = client([{ body: channel(7) }]);
		expect((await alertChannels.get(7)).id).toBe(7);
		expect(calls[0]?.url).toBe(`${BASE}/alert-channels/7`);
	});

	it("creates a Discord webhook channel with its subscriptions", async () => {
		const { alertChannels, calls } = client([{ status: 201, body: channel(9) }]);
		await alertChannels.create({
			type: "WEBHOOK",
			config: {
				name: "Discord #uptime",
				url: "https://discord.com/api/webhooks/1/x",
				method: "POST",
				headers: [],
				queryParameters: [],
				template: DISCORD_TEMPLATE,
				webhookType: "WEBHOOK_DISCORD",
			},
			sendFailure: true,
			sendRecovery: true,
			sendDegraded: true,
			subscriptions: [{ checkId: "chk-1", activated: true }],
		});
		expect(calls[0]).toMatchObject({
			method: "POST",
			url: `${BASE}/alert-channels`,
		});
		expect(calls[0]?.body).toMatchObject({
			type: "WEBHOOK",
			config: { webhookType: "WEBHOOK_DISCORD", method: "POST" },
			subscriptions: [{ checkId: "chk-1", activated: true }],
		});
	});

	it("replaces and deletes a channel", async () => {
		const { alertChannels, calls } = client([{ body: channel(9) }, { status: 204 }]);
		const replacement = {
			type: "WEBHOOK" as const,
			config: {
				name: "n",
				url: "https://discord.com/api/webhooks/1/x",
				method: "POST" as const,
			},
			sendFailure: true,
			subscriptions: [{ checkId: "chk-1", activated: true }],
		};
		await alertChannels.update(9, replacement);
		await alertChannels.delete(9);
		expect(calls.map((c) => [c.method, c.url])).toEqual([
			["PUT", `${BASE}/alert-channels/9`],
			["DELETE", `${BASE}/alert-channels/9`],
		]);
		expect(calls[0]?.body).toEqual(replacement);
	});

	it("subscribes one check to a channel through the subscriptions endpoint", async () => {
		const { alertChannels, calls } = client([
			{
				body: {
					id: 5,
					checkId: "chk-1",
					groupId: null,
					activated: true,
				},
			},
		]);
		const result = await alertChannels.subscribe(9, {
			checkId: "chk-1",
			activated: true,
		});
		expect(result).toMatchObject({ checkId: "chk-1", activated: true });
		expect(calls[0]).toMatchObject({
			method: "PUT",
			url: `${BASE}/alert-channels/9/subscriptions`,
		});
		expect(calls[0]?.body).toEqual({ checkId: "chk-1", activated: true });
	});

	it("ships the Discord template Checkly's own setup uses, with its Handlebars blocks balanced", () => {
		expect(DISCORD_TEMPLATE).toContain('"username": "Checkly"');
		expect(DISCORD_TEMPLATE).toContain("{{ALERT_TITLE}}");
		expect(DISCORD_TEMPLATE).toContain("{{RESULT_LINK}}");
		// Every opened block ({{#eq}}, {{#if}}, {{#each}}, {{#unless}}) is closed, and the open/close order nests.
		const stack: string[] = [];
		const mismatched: string[] = [];
		for (const [, kind, name] of DISCORD_TEMPLATE.matchAll(/\{\{([#/])(\w+)/g)) {
			if (kind === "#") stack.push(name!);
			else if (stack.pop() !== name) mismatched.push(name!);
		}
		expect(mismatched).toEqual([]);
		expect(stack).toEqual([]);
	});
});
