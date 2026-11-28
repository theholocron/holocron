import { describe, expect, it } from "vitest";

import { MalformedDelivery } from "../source.type.js";
import { cloudflare } from "./cloudflare.js";

const SECRET = "shared-secret";
const headers = (over: Record<string, string> = {}) => new Headers({ "cf-webhook-auth": SECRET, ...over });
const body = JSON.stringify({ name: "Origin errors", text: "5xx rate is high" });

describe("cloudflare.verify", () => {
	it("accepts the secret in cf-webhook-auth", async () => {
		expect(await cloudflare.verify(headers(), body, SECRET)).toBe(true);
	});

	it("refuses no header, a wrong or empty one, a prefix of the secret, or no secret bound", async () => {
		expect(await cloudflare.verify(new Headers(), body, SECRET)).toBe(false);
		expect(await cloudflare.verify(headers({ "cf-webhook-auth": "other" }), body, SECRET)).toBe(false);
		expect(await cloudflare.verify(headers({ "cf-webhook-auth": "" }), body, SECRET)).toBe(false);
		expect(await cloudflare.verify(headers({ "cf-webhook-auth": "shared" }), body, SECRET)).toBe(false);
		expect(await cloudflare.verify(headers({ "cf-webhook-auth": "" }), body, "")).toBe(false);
		expect(await cloudflare.verify(headers(), body, "")).toBe(false);
	});

	it("does not depend on the body, so a re-spaced one still passes and the secret is never taken from it", async () => {
		const pretty = JSON.stringify(JSON.parse(body), null, 2);
		expect(await cloudflare.verify(headers(), pretty, SECRET)).toBe(true);
		const inBody = JSON.stringify({ text: "x", "cf-webhook-auth": SECRET });
		expect(await cloudflare.verify(new Headers(), inBody, SECRET)).toBe(false);
	});
});

describe("cloudflare.format", () => {
	it("turns a notification into one embed with the text, alert, state and time", () => {
		const m = cloudflare.format(headers(), {
			name: "Origin errors",
			text: "5xx rate is high",
			ts: 1_700_000_000,
			alert_type: "http_alert_origin_error",
			alert_event: "ALERT_STATE_EVENT_START",
			data: { anything: "ignored" },
		})!;
		expect(m.username).toBe("Cloudflare");
		expect(m.allowed_mentions).toEqual({ parse: [] });
		expect(m.embeds[0]).toMatchObject({
			title: "Origin errors",
			description: "5xx rate is high",
			color: 0xe5484d,
			timestamp: "2023-11-14T22:13:20.000Z",
		});
		expect(m.embeds[0]!.fields).toEqual([
			{ name: "Alert", value: "http_alert_origin_error", inline: true },
			{ name: "State", value: "ALERT_STATE_EVENT_START", inline: true },
		]);
		expect(JSON.stringify(m)).not.toContain("ignored");
	});

	it("marks a resolved alert green", () => {
		const embed = cloudflare.format(headers(), { text: "back to normal", alert_event: "ALERT_STATE_EVENT_END" })!
			.embeds[0]!;
		expect(embed.color).toBe(0x30a46c);
		expect(embed.fields).toEqual([{ name: "State", value: "resolved", inline: true }]);
	});

	it("falls back to policy_name, then a generic title, and leaves out a bad time", () => {
		expect(cloudflare.format(headers(), { text: "t", policy_name: "P" })!.embeds[0]!.title).toBe("P");
		const bare = cloudflare.format(headers(), { text: "Hello", ts: "soon" })!.embeds[0]!;
		expect(bare.title).toBe("Cloudflare notification");
		expect(bare.timestamp).toBeUndefined();
		expect(bare.fields).toEqual([]);
		expect(cloudflare.format(headers(), { text: "t", ts: 1e20 })!.embeds[0]!.timestamp).toBeUndefined();
	});

	it("throws MalformedDelivery for a payload that is not an object or has no text", () => {
		for (const payload of [null, "x", [], {}, { text: "" }, { text: 3 }]) {
			const err = (() => {
				try {
					cloudflare.format(headers(), payload);
				} catch (e) {
					return e;
				}
			})();
			expect(err).toBeInstanceOf(MalformedDelivery);
		}
	});
});
