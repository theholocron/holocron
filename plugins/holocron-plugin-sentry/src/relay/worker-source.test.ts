import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SENTRY_RELAY_WORKER_SOURCE } from "./worker-source.js";

type Worker = { fetch(request: Request, env: Record<string, string | undefined>): Promise<Response> };

// The source is a Worker module: run it the way the runtime would, with `export default` as a value.
const worker = new Function(
	`${SENTRY_RELAY_WORKER_SOURCE.replace("export default", "const worker =")}\nreturn worker;`
)() as Worker;

const SECRET = "client-secret";
const HOOK = "https://discord.com/api/webhooks/1/token";
const env = { SENTRY_CLIENT_SECRET: SECRET, DISCORD_WEBHOOK_URL: HOOK };

const alert = (event: Record<string, unknown> = {}, rule = "Send a notification for new issues") => ({
	action: "triggered",
	installation: { uuid: "u" },
	data: {
		triggered_rule: rule,
		event: {
			title: "TypeError: x is undefined",
			culprit: "app/page in render",
			level: "error",
			web_url: "https://sentry.io/organizations/o/issues/1/events/2/",
			datetime: "2026-10-27T10:00:00Z",
			tags: [
				["environment", "production"],
				["browser", "Chrome"],
			],
			...event,
		},
	},
});

const sign = (text: string, secret = SECRET) => createHmac("sha256", secret).update(text).digest("hex");

function request(
	body: unknown,
	opts: { signature?: string | null; resource?: string; method?: string; raw?: string } = {}
) {
	const raw = opts.raw ?? JSON.stringify(body);
	const headers: Record<string, string> = { "sentry-hook-resource": opts.resource ?? "event_alert" };
	if (opts.signature !== null) headers["sentry-hook-signature"] = opts.signature ?? sign(raw);
	return new Request("https://relay.example/", {
		method: opts.method ?? "POST",
		headers,
		body: opts.method === "GET" ? undefined : raw,
	});
}

function discord(status = 204) {
	const spy = vi.fn(async () => new Response(null, { status }));
	vi.stubGlobal("fetch", spy);
	return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("the Sentry relay Worker", () => {
	it("turns an issue alert into a Discord embed and posts it", async () => {
		const spy = discord();
		const res = await worker.fetch(request(alert()), env);
		expect(res.status).toBe(204);
		expect(spy).toHaveBeenCalledTimes(1);
		const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(HOOK);
		expect(init.method).toBe("POST");
		const message = JSON.parse(init.body as string);
		expect(message.username).toBe("Sentry");
		expect(message.allowed_mentions).toEqual({ parse: [] });
		expect(message.embeds).toHaveLength(1);
		expect(message.embeds[0]).toMatchObject({
			title: "TypeError: x is undefined",
			description: "app/page in render",
			url: "https://sentry.io/organizations/o/issues/1/events/2/",
			color: 0xe5484d,
			timestamp: "2026-10-27T10:00:00Z",
		});
		expect(message.embeds[0].fields).toEqual([
			{ name: "Environment", value: "production", inline: true },
			{ name: "Level", value: "error", inline: true },
			{ name: "Rule", value: "Send a notification for new issues", inline: false },
		]);
	});

	it("colours by level, defaulting to error, and names the project when it is given", async () => {
		const spy = discord();
		for (const [level, color] of [
			["fatal", 0x8b0000],
			["warning", 0xf5a524],
			["info", 0x3e63dd],
			["debug", 0x889096],
			["mystery", 0xe5484d],
		] as const) {
			await worker.fetch(request(alert({ level, project_name: "holocron" })), env);
			const body = JSON.parse((spy.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body as string);
			expect(body.embeds[0].color).toBe(color);
			expect(body.embeds[0].fields).toContainEqual({ name: "Project", value: "holocron", inline: true });
		}
	});

	it("falls back to the message for a title, and to an environment field on the event itself", async () => {
		const spy = discord();
		await worker.fetch(
			request(alert({ title: undefined, message: "boom", environment: "staging", tags: [] })),
			env
		);
		const embed = JSON.parse((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).embeds[0];
		expect(embed.title).toBe("boom");
		expect(embed.fields[0]).toEqual({ name: "Environment", value: "staging", inline: true });
	});

	it("keeps every field inside Discord's limits", async () => {
		const spy = discord();
		await worker.fetch(
			request(alert({ title: "t".repeat(500), culprit: "c".repeat(5000) }, "r".repeat(2000))),
			env
		);
		const embed = JSON.parse((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).embeds[0];
		expect(embed.title).toHaveLength(256);
		expect(embed.title.endsWith("…")).toBe(true);
		expect(embed.description).toHaveLength(4096);
		expect(embed.fields.at(-1).value).toHaveLength(1024);
	});

	it("says nothing is configured rather than failing quietly when the Discord webhook is missing", async () => {
		const spy = discord();
		const res = await worker.fetch(request(alert()), { SENTRY_CLIENT_SECRET: SECRET });
		expect(res.status).toBe(500);
		expect(spy).not.toHaveBeenCalled();
	});

	it("answers 502 when Discord refuses the post", async () => {
		discord(429);
		expect((await worker.fetch(request(alert()), env)).status).toBe(502);
	});

	describe("who may call it", () => {
		it("only takes POST", async () => {
			const spy = discord();
			expect((await worker.fetch(request(alert(), { method: "GET" }), env)).status).toBe(405);
			expect(spy).not.toHaveBeenCalled();
		});

		it("refuses a request with no signature, a wrong one, one under another secret, or no secret configured", async () => {
			const spy = discord();
			const raw = JSON.stringify(alert());
			for (const [signature, e] of [
				[null, env],
				["deadbeef", env],
				["", env],
				[sign(raw, "other-secret"), env],
				[sign(raw), { DISCORD_WEBHOOK_URL: HOOK }],
			] as const) {
				expect((await worker.fetch(request(alert(), { signature, raw }), e)).status).toBe(401);
			}
			expect(spy).not.toHaveBeenCalled();
		});

		it("accepts a body that a proxy re-spaced, when its compact form is what was signed", async () => {
			const spy = discord();
			const body = alert();
			const signature = sign(JSON.stringify(body));
			const res = await worker.fetch(request(body, { signature, raw: JSON.stringify(body, null, 2) }), env);
			expect(res.status).toBe(204);
			expect(spy).toHaveBeenCalledTimes(1);
		});

		it("refuses a body that is not JSON even when it is signed, with a 400", async () => {
			const spy = discord();
			const raw = "not json";
			expect((await worker.fetch(request(null, { raw, signature: sign(raw) }), env)).status).toBe(400);
			expect(spy).not.toHaveBeenCalled();
		});
	});

	it("acknowledges, without posting, a resource it does not carry or an alert with no event", async () => {
		const spy = discord();
		expect((await worker.fetch(request(alert(), { resource: "issue" }), env)).status).toBe(202);
		expect((await worker.fetch(request({ action: "triggered", data: {} }), env)).status).toBe(202);
		expect((await worker.fetch(request(null, { raw: "null", signature: sign("null") }), env)).status).toBe(202);
		expect(spy).not.toHaveBeenCalled();
	});
});
