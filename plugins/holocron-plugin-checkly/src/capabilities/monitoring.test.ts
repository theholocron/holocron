import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createChecklyClient, DISCORD_TEMPLATE } from "../rest.js";
import { ChecklyMonitoring } from "./monitoring.js";

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

	describe("listChecks", () => {
		const api = (over: Record<string, unknown> = {}) => ({
			id: "c1",
			name: "uptime",
			checkType: "API",
			activated: true,
			frequency: 10,
			locations: ["us-east-1"],
			shouldFail: false,
			request: { url: "https://example.com", method: "GET", assertions: [] },
			...over,
		});

		it("reads each API check back in the shape checks are declared in", async () => {
			const { capability, stub } = makeCapability([
				{
					status: 200,
					body: [
						api({
							shouldFail: true,
							request: {
								url: "https://example.com/hook",
								method: "POST",
								body: "{}",
								assertions: [
									{ source: "STATUS_CODE", comparison: "EQUALS", target: "405" },
									{ source: "HEADERS", comparison: "CONTAINS", property: "x-a", target: "b" },
								],
							},
						}),
					],
				},
			]);
			expect(await capability.listChecks()).toEqual([
				{
					name: "uptime",
					url: "https://example.com/hook",
					method: "POST",
					frequency: 10,
					activated: true,
					shouldFail: true,
					locations: ["us-east-1"],
					body: "{}",
					assertions: [
						{ source: "status_code", comparison: "equals", target: "405" },
						{ source: "header", comparison: "contains", property: "x-a", target: "b" },
					],
				},
			]);
			expect(stub.calls[0]?.url).toContain("limit=100");
			expect(stub.calls[0]?.url).toContain("page=1");
		});

		it("leaves out locations that are null, an empty body, other check types and assertions it has no word for", async () => {
			const { capability } = makeCapability([
				{
					status: 200,
					body: [
						api({
							locations: null,
							request: {
								url: "https://example.com",
								method: "GET",
								body: "",
								assertions: [
									{ source: "JSON_BODY", comparison: "EQUALS", property: "$.a", target: "1" },
									{ source: "STATUS_CODE", comparison: "HAS_KEY" },
									{ source: "STATUS_CODE", comparison: "EQUALS" },
								],
							},
						}),
						api({ id: "c2", name: "browser", checkType: "BROWSER" }),
					],
				},
			]);
			const [check, ...rest] = await capability.listChecks();
			expect(rest).toEqual([]);
			expect(check).not.toHaveProperty("locations");
			expect(check).not.toHaveProperty("body");
			expect(check?.assertions).toEqual([{ source: "status_code", comparison: "equals" }]);
		});

		it("treats a check with no assertions list as having none", async () => {
			const { capability } = makeCapability([
				{ status: 200, body: [api({ request: { url: "https://example.com", method: "GET" } })] },
			]);
			expect((await capability.listChecks())[0]?.assertions).toEqual([]);
		});

		it("reads every page", async () => {
			const full = Array.from({ length: 100 }, (_, i) => api({ id: `c${i}`, name: `n${i}` }));
			const { capability, stub } = makeCapability([
				{ status: 200, body: full },
				{ status: 200, body: [api({ id: "last", name: "last" })] },
			]);
			expect(await capability.listChecks()).toHaveLength(101);
			expect(stub.calls[1]?.url).toContain("page=2");
		});
	});

	describe("icon", () => {
		it("carries Checkly's own icon: its CDN, and the same image embedded as a PNG", () => {
			const { capability } = makeCapability([]);
			expect(capability.icon.url).toBe(
				"https://s3.eu-central-1.amazonaws.com/cdn.checklyhq.com/slack/checkly-slack-icon.png"
			);
			const bytes = Buffer.from(capability.icon.dataUri.replace(/^data:image\/png;base64,/, ""), "base64");
			expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
			expect(bytes.length).toBeGreaterThan(1000);
			expect(bytes.length).toBeLessThan(8 * 1024 * 1024);
		});
	});

	describe("ensureAlertChannel", () => {
		const URL_NEW = "https://discord.com/api/webhooks/1/new";
		const check = (id: string) => ({ id, name: `check ${id}` });
		const webhook = (over: Record<string, unknown> = {}, subscriptions: unknown[] = [], id = 397642) => ({
			id,
			type: "WEBHOOK",
			config: {
				name: "Message to #uptime",
				url: "https://discord.com/api/webhooks/1/old",
				method: "POST",
				headers: [],
				queryParameters: [],
				template: DISCORD_TEMPLATE,
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
		const sub = (checkId: string, activated = true) => ({ id: 1, checkId, groupId: null, activated });
		const subscribed = (checkId: string) => ({ id: 5, checkId, groupId: null, activated: true });
		const input = { name: "Message to #uptime", format: "discord" as const, url: URL_NEW };
		const writes = (stub: ReturnType<typeof stubFetch>) => stub.calls.filter((c) => c.method !== "GET");

		it("creates a Discord webhook channel with Checkly's Discord template, then subscribes every check and reads it back", async () => {
			const { capability, stub } = makeCapability([
				{ body: [] }, // channels
				{ body: [check("a"), check("b")] }, // checks
				{ status: 201, body: webhook({}, [], 7) }, // create
				{ body: webhook({}, [], 7) }, // read back: nothing subscribed (create ignores the list)
				{ body: subscribed("a") },
				{ body: subscribed("b") },
				{ body: webhook({}, [sub("a"), sub("b")], 7) }, // read back again
			]);
			const result = await capability.ensureAlertChannel(input);
			expect(result).toEqual({ created: true, updated: [], subscribed: 2 });
			const [created, ...subs] = writes(stub);
			expect(created?.method).toBe("POST");
			expect(created?.body).toMatchObject({
				type: "WEBHOOK",
				config: {
					name: "Message to #uptime",
					url: URL_NEW,
					method: "POST",
					webhookType: "WEBHOOK_DISCORD",
					template: DISCORD_TEMPLATE,
				},
				sendFailure: true,
				sendRecovery: true,
				sendDegraded: true,
			});
			// It does not rely on the list in the create body: each check goes through the subscriptions call.
			expect(created?.body).not.toHaveProperty("subscriptions");
			expect(subs.map((c) => [c.method, new URL(c.url).pathname, c.body])).toEqual([
				["PUT", "/v1/alert-channels/7/subscriptions", { checkId: "a", activated: true }],
				["PUT", "/v1/alert-channels/7/subscriptions", { checkId: "b", activated: true }],
			]);
		});

		it("fails, naming the shortfall, when Checkly does not hold what it was asked to subscribe", async () => {
			const { capability } = makeCapability([
				{ body: [] },
				{ body: [check("a"), check("b")] },
				{ status: 201, body: webhook({}, [], 7) },
				{ body: webhook({}, [], 7) },
				{ body: subscribed("a") },
				{ body: subscribed("b") },
				{ body: webhook({}, [sub("a")], 7) }, // only one took
			]);
			await expect(capability.ensureAlertChannel(input)).rejects.toThrow(
				/Checkly did not subscribe 1 of 2 checks to alert channel "Message to #uptime" \(it holds 1\)/
			);
		});

		it("refuses to create one with no URL, and says why", async () => {
			const { capability } = makeCapability([{ body: [] }, { body: [check("a")] }]);
			await expect(
				capability.ensureAlertChannel({ name: "Message to #uptime", format: "discord" })
			).rejects.toThrow(/Discord shows a webhook URL only once/);
		});

		it("adopts a channel of the same name, replaces its URL and keeps its settings and subscriptions", async () => {
			const existing = webhook({}, [sub("a")]);
			const { capability, stub } = makeCapability([
				{ body: [existing] },
				{ body: [check("a")] },
				{ body: existing }, // read again just before replacing
				{ body: existing }, // update
				{ body: existing }, // read back
			]);
			const result = await capability.ensureAlertChannel(input);
			expect(result).toEqual({ created: false, updated: ["url"], subscribed: 1 });
			const [put] = writes(stub);
			expect(put?.url).toContain("/alert-channels/397642");
			expect(put?.body).toMatchObject({
				config: { url: URL_NEW, template: DISCORD_TEMPLATE },
				sendDegraded: false,
				autoSubscribe: true,
			});
			// What it already has goes back without ids: with them Checkly answered 409.
			expect((put?.body as { subscriptions: unknown[] }).subscriptions).toEqual([
				{ checkId: "a", activated: true },
			]);
		});

		it("puts the shipped template back on a channel whose template was edited, and keeps the rest", async () => {
			const edited = webhook({ url: URL_NEW, template: "custom template" }, [sub("a")]);
			const { capability, stub } = makeCapability([
				{ body: [edited] },
				{ body: [check("a")] },
				{ body: edited },
				{ body: edited },
				{ body: edited },
			]);
			const result = await capability.ensureAlertChannel(input);
			expect(result.updated).toEqual(["template"]);
			expect(writes(stub)[0]?.body).toMatchObject({
				config: { url: URL_NEW, webhookType: "WEBHOOK_DISCORD", template: DISCORD_TEMPLATE },
				subscriptions: [{ checkId: "a", activated: true }],
			});
		});

		it("sets the template on a channel that has none", async () => {
			const bare = webhook({ url: URL_NEW, template: undefined }, [sub("a")]);
			const { capability } = makeCapability([
				{ body: [bare] },
				{ body: [check("a")] },
				{ body: bare },
				{ body: bare },
				{ body: bare },
			]);
			expect((await capability.ensureAlertChannel(input)).updated).toEqual(["template"]);
		});

		it("does not call a template changed when only its whitespace differs", async () => {
			const same = webhook({ url: URL_NEW, template: DISCORD_TEMPLATE.replace(/\t/g, "  ") }, [sub("a")]);
			const { capability, stub } = makeCapability([{ body: [same] }, { body: [check("a")] }, { body: same }]);
			expect((await capability.ensureAlertChannel(input)).updated).toEqual([]);
			expect(writes(stub)).toEqual([]);
		});

		it("subscribes only what is missing through the subscriptions call, and leaves the channel itself alone", async () => {
			const before = webhook({ url: URL_NEW }, [sub("a")]);
			const { capability, stub } = makeCapability([
				{ body: [before] },
				{ body: [check("a"), check("b")] },
				{ body: before },
				{ body: subscribed("b") },
				{ body: webhook({ url: URL_NEW }, [sub("a"), sub("b")]) },
			]);
			const result = await capability.ensureAlertChannel(input);
			expect(result).toEqual({ created: false, updated: ["subscriptions"], subscribed: 2 });
			expect(writes(stub).map((c) => [c.method, new URL(c.url).pathname])).toEqual([
				["PUT", "/v1/alert-channels/397642/subscriptions"],
			]);
		});

		it("writes nothing when the URL and subscriptions already match", async () => {
			const same = webhook({ url: URL_NEW }, [sub("a")]);
			const { capability, stub } = makeCapability([{ body: [same] }, { body: [check("a")] }, { body: same }]);
			const result = await capability.ensureAlertChannel(input);
			expect(result).toEqual({ created: false, updated: [], subscribed: 1 });
			expect(writes(stub)).toEqual([]);
		});

		it("leaves a subscription someone switched off alone, and does not count it", async () => {
			const muted = webhook({ url: URL_NEW }, [sub("a"), sub("b", false)]);
			const { capability, stub } = makeCapability([
				{ body: [muted] },
				{ body: [check("a"), check("b")] },
				{ body: muted },
			]);
			const result = await capability.ensureAlertChannel(input);
			expect(result).toEqual({ created: false, updated: [], subscribed: 1 });
			expect(writes(stub)).toEqual([]);
		});

		it("turns a channel in another format into a Discord one, template included", async () => {
			const teams = webhook({ webhookType: "WEBHOOK_MSTEAMS", template: "teams card" }, [sub("a")]);
			const { capability, stub } = makeCapability([
				{ body: [teams] },
				{ body: [check("a")] },
				{ body: teams },
				{ body: teams },
				{ body: teams },
			]);
			const result = await capability.ensureAlertChannel(input);
			expect(result.updated).toEqual(["url", "format"]);
			expect(writes(stub)[0]?.body).toMatchObject({
				config: { webhookType: "WEBHOOK_DISCORD", template: DISCORD_TEMPLATE },
			});
		});

		it("changes only the format, keeping the URL it has, when no new URL comes with it", async () => {
			const teams = webhook({ webhookType: "WEBHOOK_MSTEAMS" }, [sub("a")]);
			const { capability, stub } = makeCapability([
				{ body: [teams] },
				{ body: [check("a")] },
				{ body: teams },
				{ body: teams },
				{ body: teams },
			]);
			const result = await capability.ensureAlertChannel({ name: "Message to #uptime", format: "discord" });
			expect(result.updated).toEqual(["format"]);
			expect(writes(stub)[0]?.body).toMatchObject({
				config: { url: "https://discord.com/api/webhooks/1/old", webhookType: "WEBHOOK_DISCORD" },
			});
		});

		it("ignores a channel of another type or name, and keeps subscriptions to groups on an update", async () => {
			const email = { ...webhook(), id: 1, type: "EMAIL", config: { address: "a@b.c" } };
			const other = webhook({ name: "Slack-ish" }, [], 2);
			const mine = webhook({ webhookType: "WEBHOOK_MSTEAMS" }, [
				{ id: 9, checkId: null, groupId: 4, activated: true },
			]);
			const { capability, stub } = makeCapability([
				{ body: [email, other, mine] },
				{ body: [] },
				{ body: mine },
				{ body: mine },
				{ body: mine },
			]);
			await capability.ensureAlertChannel(input);
			expect((writes(stub)[0]?.body as { subscriptions: unknown[] }).subscriptions).toEqual([
				{ groupId: 4, activated: true },
			]);
		});

		it("reads the channel again just before replacing it, so a subscription added since the listing survives", async () => {
			const listed = webhook({}, [sub("a")]);
			const fresh = webhook({}, [sub("a"), sub("b")]);
			const { capability, stub } = makeCapability([
				{ body: [listed] },
				{ body: [check("a"), check("b")] },
				{ body: fresh },
				{ body: fresh },
				{ body: fresh },
			]);
			await capability.ensureAlertChannel(input);
			expect((writes(stub)[0]?.body as { subscriptions: unknown[] }).subscriptions).toEqual([
				{ checkId: "a", activated: true },
				{ checkId: "b", activated: true },
			]);
		});

		it("puts back, in their own state, every kind of subscription an update dropped", async () => {
			const group = { id: 9, checkId: null, groupId: 4, activated: true };
			const had = webhook({}, [sub("a"), sub("outside", false), group]);
			const dropped = webhook({}, [sub("a")]);
			const restored = webhook({}, [sub("a"), sub("outside", false), group]);
			const { capability, stub } = makeCapability([
				{ body: [had] },
				{ body: [check("a")] },
				{ body: had }, // read again
				{ body: dropped }, // update
				{ body: dropped }, // read back: two were lost
				{ body: subscribed("outside") },
				{ body: subscribed("x") },
				{ body: restored },
			]);
			await capability.ensureAlertChannel(input);
			expect(
				writes(stub)
					.slice(1)
					.map((c) => c.body)
			).toEqual([
				{ checkId: "outside", activated: false },
				{ groupId: 4, activated: true },
			]);
		});

		it("treats a 409 on a subscription as already there, and goes on", async () => {
			const before = webhook({ url: URL_NEW }, []);
			const { capability } = makeCapability([
				{ body: [before] },
				{ body: [check("a"), check("b")] },
				{ body: before },
				{ status: 409, body: { message: "Conflict" } },
				{ body: subscribed("b") },
				{ body: webhook({ url: URL_NEW }, [sub("a"), sub("b")]) },
			]);
			expect(await capability.ensureAlertChannel(input)).toEqual({
				created: false,
				updated: ["subscriptions"],
				subscribed: 2,
			});
		});

		it("keeps going when one subscription is refused, reads back, and reports the shortfall with the reason", async () => {
			const before = webhook({ url: URL_NEW }, []);
			const { capability, stub } = makeCapability([
				{ body: [before] },
				{ body: [check("a"), check("b")] },
				{ body: before },
				{ status: 403, body: { message: "Forbidden" } },
				{ body: subscribed("b") },
				{ body: webhook({ url: URL_NEW }, [sub("b")]) },
			]);
			await expect(capability.ensureAlertChannel(input)).rejects.toThrow(
				/did not subscribe 1 of 2 checks to alert channel "Message to #uptime" \(it holds 1\): .*403/
			);
			expect(writes(stub)).toHaveLength(2);
		});

		it("fails when a requested subscription came back switched off", async () => {
			const before = webhook({ url: URL_NEW }, []);
			const { capability } = makeCapability([
				{ body: [before] },
				{ body: [check("a")] },
				{ body: before },
				{ body: subscribed("a") },
				{ body: webhook({ url: URL_NEW }, [sub("a", false)]) },
			]);
			await expect(capability.ensureAlertChannel(input)).rejects.toThrow(/did not subscribe 1 of 1 checks/);
		});

		it("reads every page of checks", async () => {
			const full = Array.from({ length: 100 }, (_, i) => check(`c${i}`));
			const mine = webhook(
				{ url: URL_NEW },
				full.map((c) => sub(c.id))
			);
			const { capability, stub } = makeCapability([
				{ body: [mine] },
				{ body: full },
				{ body: [check("last")] },
				{ body: mine },
				{ body: subscribed("last") },
				{ body: webhook({ url: URL_NEW }, [...full.map((c) => sub(c.id)), sub("last")]) },
			]);
			const result = await capability.ensureAlertChannel(input);
			expect(result.subscribed).toBe(101);
			expect(stub.calls.some((c) => c.url.includes("page=2"))).toBe(true);
		});
	});

	describe("inspectAlertChannel", () => {
		const TOKEN = "sentinel-webhook-token";
		const channel = (over: Record<string, unknown> = {}, subscriptions: unknown[] = []) => ({
			id: 9,
			type: "WEBHOOK",
			config: {
				name: "Message to #uptime",
				url: `https://discord.com/api/webhooks/1234567/${TOKEN}`,
				method: "POST",
				headers: [],
				queryParameters: [],
				template: "",
				webhookType: "WEBHOOK_DISCORD",
				...over,
			},
			subscriptions,
		});
		const sub = (checkId: string, activated = true) => ({ id: 1, checkId, groupId: null, activated });
		const checks = [
			{ id: "a", name: "check a" },
			{ id: "b", name: "check b" },
			{ id: "c", name: "check c" },
		];

		it("names the webhook by its id and lists the checks it lacks or has switched off, without the URL", async () => {
			const { capability } = makeCapability([
				{ body: [channel()] },
				{ body: checks },
				{ body: channel({}, [sub("a"), sub("b", false)]) },
			]);
			const state = await capability.inspectAlertChannel("Message to #uptime");
			expect(state).toEqual({
				exists: true,
				discord: true,
				webhookId: "1234567",
				unsubscribed: ["check c"],
				deactivated: ["check b"],
			});
			expect(JSON.stringify(state)).not.toContain(TOKEN);
		});

		it("reports a channel that is missing, and a URL that is not a Discord webhook", async () => {
			const none = makeCapability([{ body: [channel({ name: "other" })] }, { body: checks }]);
			expect(await none.capability.inspectAlertChannel("Message to #uptime")).toEqual({
				exists: false,
				unsubscribed: [],
				deactivated: [],
			});
			const odd = makeCapability([
				{ body: [channel({ url: "https://example.com/hook", webhookType: "WEBHOOK_SPIKE" })] },
				{ body: [] },
				{ body: channel({ url: "https://example.com/hook", webhookType: "WEBHOOK_SPIKE" }) },
			]);
			expect(await odd.capability.inspectAlertChannel("Message to #uptime")).toEqual({
				exists: true,
				discord: false,
				unsubscribed: [],
				deactivated: [],
			});
		});

		it("ignores a group subscription and a channel of another kind with the same name", async () => {
			const { capability } = makeCapability([
				{
					body: [
						{ id: 3, type: "EMAIL", config: { name: "Message to #uptime" }, subscriptions: [] },
						channel(),
					],
				},
				{ body: checks },
				{
					body: channel({}, [
						{ id: 2, checkId: null, groupId: 7, activated: true },
						sub("a"),
						sub("b"),
						sub("c"),
					]),
				},
			]);
			expect(await capability.inspectAlertChannel("Message to #uptime")).toMatchObject({
				exists: true,
				unsubscribed: [],
				deactivated: [],
			});
		});
	});
});
