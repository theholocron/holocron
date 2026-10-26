import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { ChecklyMonitoring } from "../capabilities/monitoring.js";
import { createChecklyClient, DISCORD_TEMPLATE } from "../rest.js";

function makeCapability(
	responses: Array<{ status?: number; body?: unknown }>,
	opts: { checks?: Parameters<typeof ChecklyMonitoring.prototype.ensureCheck>[0][] } = {}
) {
	const stub = stubFetch(responses);
	const client = createChecklyClient({ token: "t", accountId: "acct-1", fetch: stub.fetch });
	const capability = new ChecklyMonitoring(() => client, { checks: opts.checks });
	return { capability, stub };
}

describe("ChecklyMonitoring", () => {
	it("constructs with a Checkly client", () => {
		const { capability } = makeCapability([]);
		expect(capability.key).toBe("monitoring");
	});

	it("exposes the checks it was configured with", () => {
		const input = { name: "uptime", url: "https://example.com" };
		const { capability } = makeCapability([], { checks: [input] });
		expect(capability.checks).toEqual([input]);
	});

	it("defaults checks to an empty array when none are configured", () => {
		const { capability } = makeCapability([]);
		expect(capability.checks).toEqual([]);
	});

	describe("whoami", () => {
		it("reports ok when the checks list request succeeds", async () => {
			const { capability } = makeCapability([{ status: 200, body: [] }]);
			expect(await capability.whoami()).toEqual({ ok: true });
		});

		it("reports not ok when the checks list request fails", async () => {
			const { capability } = makeCapability([{ status: 401, body: { messages: ["invalid"] } }]);
			expect(await capability.whoami()).toEqual({ ok: false });
		});
	});

	describe("ensureCheck", () => {
		const input = {
			name: "Sentinel webhook uptime",
			url: "https://sentinel.theholocron.dev/api/webhook",
			method: "GET" as const,
			assertions: [{ source: "status_code" as const, comparison: "equals" as const, target: "405" }],
		};

		it("creates a check when no exact name match exists", async () => {
			const { capability, stub } = makeCapability([
				{ status: 200, body: [] },
				{ status: 200, body: { id: "check-1", name: input.name } },
			]);

			const result = await capability.ensureCheck(input);

			expect(result).toEqual({ check: { id: "check-1", name: input.name }, alreadyExists: false });
			expect(stub.calls[0]?.url).toContain("/checks");
			expect(stub.calls[0]?.url).toContain(`search=${input.name.replace(/ /g, "+")}`);
			expect(stub.calls[1]?.method).toBe("POST");
			expect(stub.calls[1]?.url).toContain("/checks/api");
			expect(stub.calls[1]?.body).toMatchObject({
				name: input.name,
				request: {
					url: input.url,
					method: "GET",
					assertions: [{ source: "STATUS_CODE", comparison: "EQUALS", target: "405" }],
				},
			});
		});

		it("updates the existing check when a partial-search candidate matches the exact name", async () => {
			const { capability, stub } = makeCapability([
				{
					status: 200,
					body: [
						{ id: "other", name: "Sentinel webhook uptime check" },
						{ id: "check-1", name: input.name },
					],
				},
				{ status: 200, body: { id: "check-1", name: input.name } },
			]);

			const result = await capability.ensureCheck(input);

			expect(result).toEqual({ check: { id: "check-1", name: input.name }, alreadyExists: true });
			expect(stub.calls[1]?.method).toBe("PUT");
			expect(stub.calls[1]?.url).toContain("/checks/api/check-1");
		});

		it("creates (rather than updates) when the search only returns partial-match candidates", async () => {
			const { capability, stub } = makeCapability([
				{ status: 200, body: [{ id: "other", name: "Sentinel webhook uptime check" }] },
				{ status: 200, body: { id: "check-2", name: input.name } },
			]);

			const result = await capability.ensureCheck(input);

			expect(result.alreadyExists).toBe(false);
			expect(stub.calls[1]?.method).toBe("POST");
		});

		it("defaults method to GET and omits optional fields when not provided", async () => {
			const { capability, stub } = makeCapability([
				{ status: 200, body: [] },
				{ status: 200, body: { id: "check-3", name: "minimal" } },
			]);

			await capability.ensureCheck({ name: "minimal", url: "https://example.com" });

			expect(stub.calls[1]?.body).toMatchObject({
				name: "minimal",
				request: { url: "https://example.com", method: "GET", assertions: [] },
			});
		});

		it("includes frequency, activated, locations, shouldFail, and assertion property/target when provided", async () => {
			const { capability, stub } = makeCapability([
				{ status: 200, body: [] },
				{ status: 200, body: { id: "check-4", name: "full" } },
			]);

			await capability.ensureCheck({
				name: "full",
				url: "https://example.com",
				frequency: 5,
				activated: false,
				locations: ["us-east-1", "eu-west-1"],
				shouldFail: true,
				assertions: [{ source: "header", comparison: "contains", property: "content-type", target: "json" }],
			});

			expect(stub.calls[1]?.body).toMatchObject({
				name: "full",
				frequency: 5,
				activated: false,
				locations: ["us-east-1", "eu-west-1"],
				shouldFail: true,
				request: {
					assertions: [
						{ source: "HEADERS", comparison: "CONTAINS", property: "content-type", target: "json" },
					],
				},
			});
		});

		it("omits locations and shouldFail when not provided", async () => {
			const { capability, stub } = makeCapability([
				{ status: 200, body: [] },
				{ status: 200, body: { id: "check-5", name: "no-locations" } },
			]);

			await capability.ensureCheck({ name: "no-locations", url: "https://example.com" });

			expect(stub.calls[1]?.body).not.toHaveProperty("locations");
			expect(stub.calls[1]?.body).not.toHaveProperty("shouldFail");
		});

		it("includes a request body when provided", async () => {
			const { capability, stub } = makeCapability([
				{ status: 200, body: [] },
				{ status: 200, body: { id: "check-6", name: "signature-check" } },
			]);

			await capability.ensureCheck({
				name: "signature-check",
				url: "https://example.com",
				method: "POST",
				body: "{}",
				shouldFail: true,
				assertions: [{ source: "status_code", comparison: "equals", target: "401" }],
			});

			expect(stub.calls[1]?.body).toMatchObject({
				request: { url: "https://example.com", method: "POST", body: "{}" },
			});
		});

		it("omits the request body when not provided", async () => {
			const { capability, stub } = makeCapability([
				{ status: 200, body: [] },
				{ status: 200, body: { id: "check-7", name: "no-body" } },
			]);

			await capability.ensureCheck({ name: "no-body", url: "https://example.com" });

			expect((stub.calls[1]?.body as { request: Record<string, unknown> }).request).not.toHaveProperty("body");
		});
	});

	describe("ensureAlertChannel", () => {
		const URL_NEW = "https://discord.com/api/webhooks/1/new";
		const check = (id: string) => ({ id, name: `check ${id}` });
		const webhook = (over: Record<string, unknown> = {}, subscriptions: unknown[] = []) => ({
			id: 397642,
			type: "WEBHOOK",
			config: {
				name: "Discord #uptime",
				url: "https://discord.com/api/webhooks/1/old",
				method: "POST",
				headers: [],
				queryParameters: [],
				template: "custom template",
				webhookType: "WEBHOOK_DISCORD",
				...over,
			},
			sendRecovery: true,
			sendFailure: true,
			sendDegraded: false,
			sslExpiry: false,
			sslExpiryThreshold: 30,
			autoSubscribe: true,
			subscriptions,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: null,
		});
		const sub = (checkId: string) => ({ id: 1, checkId, groupId: null, activated: true });
		const bodyOf = (stub: ReturnType<typeof stubFetch>, i: number) =>
			stub.calls[i]?.body as Record<string, unknown>;

		it("creates a Discord webhook channel subscribed to every check, with Checkly's Discord template", async () => {
			const { capability, stub } = makeCapability([
				{ body: [] },
				{ body: [check("a"), check("b")] },
				{ status: 201, body: webhook() },
			]);
			const result = await capability.ensureAlertChannel({
				name: "Discord #uptime",
				format: "discord",
				url: URL_NEW,
			});
			expect(result).toEqual({ created: true, updated: [], subscribed: 2 });
			const created = stub.calls.find((c) => c.method === "POST")!;
			expect(created.body).toMatchObject({
				type: "WEBHOOK",
				config: { name: "Discord #uptime", url: URL_NEW, method: "POST", webhookType: "WEBHOOK_DISCORD" },
				sendFailure: true,
				sendRecovery: true,
				sendDegraded: true,
				subscriptions: [
					{ checkId: "a", activated: true },
					{ checkId: "b", activated: true },
				],
			});
			expect((created.body as { config: { template: string } }).config.template).toBe(DISCORD_TEMPLATE);
		});

		it("refuses to create one with no URL, and says why", async () => {
			const { capability } = makeCapability([{ body: [] }, { body: [check("a")] }]);
			await expect(capability.ensureAlertChannel({ name: "Discord #uptime", format: "discord" })).rejects.toThrow(
				/Discord shows a webhook URL only once/
			);
		});

		it("adopts a channel with the same name and replaces its URL, keeping its template, settings and subscriptions", async () => {
			const { capability, stub } = makeCapability([
				{ body: [webhook({}, [sub("a")])] },
				{ body: [check("a"), check("b")] },
				{ body: webhook() },
			]);
			const result = await capability.ensureAlertChannel({
				name: "Discord #uptime",
				format: "discord",
				url: URL_NEW,
			});
			expect(result).toEqual({ created: false, updated: ["url", "subscriptions"], subscribed: 2 });
			const put = stub.calls.find((c) => c.method === "PUT")!;
			expect(put.url).toContain("/alert-channels/397642");
			expect(put.body).toMatchObject({
				config: { url: URL_NEW, template: "custom template", name: "Discord #uptime" },
				sendDegraded: false,
				autoSubscribe: true,
				subscriptions: [{ checkId: "a" }, { checkId: "b", activated: true }],
			});
		});

		it("subscribes only what is missing when there is no new URL, and keeps the one it has", async () => {
			const { capability, stub } = makeCapability([
				{ body: [webhook({}, [sub("a")])] },
				{ body: [check("a"), check("b")] },
				{ body: webhook() },
			]);
			const result = await capability.ensureAlertChannel({ name: "Discord #uptime", format: "discord" });
			expect(result.updated).toEqual(["subscriptions"]);
			expect(bodyOf(stub, 2)["config"]).toMatchObject({ url: "https://discord.com/api/webhooks/1/old" });
		});

		it("leaves a subscription someone switched off alone, and does not count it", async () => {
			const muted = { id: 2, checkId: "b", groupId: null, activated: false };
			const { capability, stub } = makeCapability([
				{ body: [webhook({ url: URL_NEW }, [sub("a"), muted])] },
				{ body: [check("a"), check("b")] },
			]);
			const result = await capability.ensureAlertChannel({
				name: "Discord #uptime",
				format: "discord",
				url: URL_NEW,
			});
			expect(result).toEqual({ created: false, updated: [], subscribed: 1 });
			expect(stub.calls.filter((c) => c.method !== "GET")).toEqual([]);
		});

		it("turns a channel in another format into a Discord one, template included", async () => {
			const teams = webhook({ webhookType: "WEBHOOK_MSTEAMS", template: "teams card" }, [sub("a")]);
			const { capability, stub } = makeCapability([{ body: [teams] }, { body: [check("a")] }, { body: teams }]);
			const result = await capability.ensureAlertChannel({
				name: "Discord #uptime",
				format: "discord",
				url: URL_NEW,
			});
			expect(result.updated).toEqual(["url", "format"]);
			expect(bodyOf(stub, 2)["config"]).toMatchObject({
				webhookType: "WEBHOOK_DISCORD",
				template: DISCORD_TEMPLATE,
			});
		});

		it("writes nothing when the URL and subscriptions already match", async () => {
			const { capability, stub } = makeCapability([
				{ body: [webhook({ url: URL_NEW }, [sub("a")])] },
				{ body: [check("a")] },
			]);
			const result = await capability.ensureAlertChannel({
				name: "Discord #uptime",
				format: "discord",
				url: URL_NEW,
			});
			expect(result).toEqual({ created: false, updated: [], subscribed: 1 });
			expect(stub.calls.filter((c) => c.method !== "GET")).toEqual([]);
		});

		it("ignores a channel of another type or name, and keeps subscriptions to groups", async () => {
			const email = { ...webhook(), id: 1, type: "EMAIL", config: { address: "a@b.c" } };
			const other = webhook({ name: "Slack-ish" });
			const { capability, stub } = makeCapability([
				{ body: [email, other] },
				{ body: [] },
				{ status: 201, body: webhook() },
			]);
			await capability.ensureAlertChannel({ name: "Discord #uptime", format: "discord", url: URL_NEW });
			expect(stub.calls.map((c) => c.method)).toEqual(["GET", "GET", "POST"]);

			const grouped = webhook({}, [{ id: 9, checkId: null, groupId: 4, activated: true }]);
			const second = makeCapability([{ body: [grouped] }, { body: [check("a")] }, { body: grouped }]);
			await second.capability.ensureAlertChannel({ name: "Discord #uptime", format: "discord" });
			expect(bodyOf(second.stub, 2)["subscriptions"]).toEqual([
				{ id: 9, checkId: null, groupId: 4, activated: true },
				{ checkId: "a", activated: true },
			]);
		});

		it("reads every page of checks", async () => {
			const full = Array.from({ length: 100 }, (_, i) => check(`c${i}`));
			const { capability, stub } = makeCapability([
				{ body: [] },
				{ body: full },
				{ body: [check("last")] },
				{ status: 201, body: webhook() },
			]);
			const result = await capability.ensureAlertChannel({
				name: "Discord #uptime",
				format: "discord",
				url: URL_NEW,
			});
			expect(result.subscribed).toBe(101);
			expect(stub.calls.some((c) => c.url.includes("page=2"))).toBe(true);
		});
	});
});
