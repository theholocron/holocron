import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { MalformedDelivery } from "../source.type.js";
import { sentry } from "./sentry.js";

const SECRET = "client-secret";
const sign = (text: string, secret = SECRET) => createHmac("sha256", secret).update(text).digest("hex");
const headers = (over: Record<string, string> = {}) => new Headers({ "sentry-hook-resource": "event_alert", ...over });

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

describe("sentry.verify", () => {
	const body = JSON.stringify(alert());

	it("accepts the body signed under the client secret", async () => {
		expect(await sentry.verify(headers({ "sentry-hook-signature": sign(body) }), body, SECRET)).toBe(true);
	});

	it("refuses no signature, a wrong one, one under another secret, an empty one, or no secret", async () => {
		for (const [signature, secret] of [
			[undefined, SECRET],
			["deadbeef", SECRET],
			["", SECRET],
			[sign(body, "other"), SECRET],
			[sign(body), ""],
		] as const) {
			const h = headers(signature === undefined ? {} : { "sentry-hook-signature": signature });
			expect(await sentry.verify(h, body, secret)).toBe(false);
		}
	});

	it("refuses a re-spaced body, and one whose re-serialised form was signed", async () => {
		const pretty = JSON.stringify(alert(), null, 2);
		expect(await sentry.verify(headers({ "sentry-hook-signature": sign(body) }), pretty, SECRET)).toBe(false);
		// 1e400 re-serialises as null, so a signed null must not vouch for it.
		const signed = '{"a":null}';
		expect(await sentry.verify(headers({ "sentry-hook-signature": sign(signed) }), '{"a":1e400}', SECRET)).toBe(
			false
		);
	});

	it("refuses a body that is not JSON and does not match", async () => {
		expect(await sentry.verify(headers({ "sentry-hook-signature": sign("other") }), "not json", SECRET)).toBe(
			false
		);
	});
});

describe("sentry.format", () => {
	it("turns an issue alert into one embed with the title, culprit, link, level colour and time", () => {
		const m = sentry.format(headers(), alert())!;
		expect(m.username).toBe("Sentry");
		expect(m.allowed_mentions).toEqual({ parse: [] });
		expect(m.embeds).toHaveLength(1);
		expect(m.embeds[0]).toMatchObject({
			title: "TypeError: x is undefined",
			description: "app/page in render",
			url: "https://sentry.io/organizations/o/issues/1/events/2/",
			color: 0xe5484d,
			timestamp: "2026-10-27T10:00:00Z",
		});
		expect(m.embeds[0]!.fields).toEqual([
			{ name: "Environment", value: "production", inline: true },
			{ name: "Level", value: "error", inline: true },
			{ name: "Rule", value: "Send a notification for new issues", inline: false },
		]);
	});

	it("colours by level, defaulting to error, and names the project when it is given", () => {
		for (const [level, color] of [
			["fatal", 0x8b0000],
			["warning", 0xf5a524],
			["info", 0x3e63dd],
			["debug", 0x889096],
			["mystery", 0xe5484d],
		] as const) {
			const embed = sentry.format(headers(), alert({ level, project_name: "holocron" }))!.embeds[0]!;
			expect(embed.color).toBe(color);
			expect(embed.fields).toContainEqual({ name: "Project", value: "holocron", inline: true });
		}
	});

	it("falls back to the message for a title, the event's own environment, a project tag and the numeric project", () => {
		const bare = sentry.format(
			headers(),
			alert({ title: undefined, message: "boom", environment: "staging", tags: [] })
		)!;
		expect(bare.embeds[0]!.title).toBe("boom");
		expect(bare.embeds[0]!.fields![0]).toEqual({ name: "Environment", value: "staging", inline: true });

		const tagged = sentry.format(headers(), alert({ tags: [["project", "from-tag"]] }))!;
		expect(tagged.embeds[0]!.fields).toContainEqual({ name: "Project", value: "from-tag", inline: true });

		const numeric = sentry.format(headers(), alert({ project: 4 }))!;
		expect(numeric.embeds[0]!.fields).toContainEqual({ name: "Project", value: "4", inline: true });
	});

	it("titles an event with neither a title nor a message 'Error', and leaves out what it has no value for", () => {
		const m = sentry.format(
			headers(),
			alert({
				title: undefined,
				message: undefined,
				culprit: undefined,
				web_url: undefined,
				datetime: undefined,
				level: undefined,
			})
		)!;
		const embed = m.embeds[0]!;
		expect(embed.title).toBe("Error");
		expect(embed).not.toHaveProperty("description");
		expect(embed).not.toHaveProperty("url");
		expect(embed).not.toHaveProperty("timestamp");
		expect(embed.color).toBe(0xe5484d);
	});

	it("keeps every field inside Discord's limits", () => {
		const embed = sentry.format(
			headers(),
			alert({ title: "t".repeat(500), culprit: "c".repeat(5000) }, "r".repeat(2000))
		)!.embeds[0]!;
		expect(embed.title).toHaveLength(256);
		expect(embed.description).toHaveLength(4096);
		expect(embed.fields!.at(-1)!.value).toHaveLength(1024);
	});

	it("reads tags given as { key, value } objects too", () => {
		const m = sentry.format(
			headers(),
			alert({
				tags: [{ key: "environment", value: "prod" }, { key: "project", value: "web" }, { key: "x" }, null],
			})
		)!;
		expect(m.embeds[0]!.fields).toContainEqual({ name: "Environment", value: "prod", inline: true });
		expect(m.embeds[0]!.fields).toContainEqual({ name: "Project", value: "web", inline: true });
	});

	it("keeps the whole embed inside Discord's combined text limit", () => {
		const embed = sentry.format(
			headers(),
			alert(
				{
					title: "t".repeat(300),
					culprit: "c".repeat(5000),
					environment: "e".repeat(2000),
					project_name: "p".repeat(2000),
				},
				"r".repeat(2000)
			)
		)!.embeds[0]!;
		const total =
			embed.title!.length +
			(embed.description?.length ?? 0) +
			embed.fields!.reduce((n, f) => n + f.name.length + f.value.length, 0);
		expect(total).toBeLessThanOrEqual(6000);
	});

	it("drops a resource it does not carry, and rejects an event_alert it cannot read", () => {
		expect(sentry.format(headers({ "sentry-hook-resource": "issue" }), alert())).toBeNull();
		expect(() => sentry.format(headers(), { action: "triggered", data: {} })).toThrow(MalformedDelivery);
		expect(() => sentry.format(headers(), null)).toThrow(MalformedDelivery);
	});
});
