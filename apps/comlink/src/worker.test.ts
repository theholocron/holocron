import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./worker.js";

afterEach(() => vi.unstubAllGlobals());

describe("the Worker", () => {
	it("carries a signed Sentry issue alert at /sentry into Discord", async () => {
		const spy = vi.fn(async () => new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", spy);
		const body = JSON.stringify({ data: { event: { title: "Boom", level: "error" }, triggered_rule: "r" } });
		const request = new Request("https://comlink.theholocron.dev/sentry", {
			method: "POST",
			headers: {
				"sentry-hook-resource": "event_alert",
				"sentry-hook-signature": createHmac("sha256", "secret").update(body).digest("hex"),
			},
			body,
		});
		const res = await worker.fetch(request, {
			COMLINK_SENTRY_SECRET: "secret",
			COMLINK_SENTRY_WEBHOOK: "https://discord.com/api/webhooks/1/t",
		});
		expect(res.status).toBe(204);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("knows no other source yet", async () => {
		const res = await worker.fetch(
			new Request("https://comlink.theholocron.dev/github", { method: "POST", body: "{}" }),
			{}
		);
		expect(res.status).toBe(404);
	});
});
