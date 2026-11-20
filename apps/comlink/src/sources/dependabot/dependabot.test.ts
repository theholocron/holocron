import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { MalformedDelivery } from "../source.type.js";
import { dependabot } from "./dependabot.js";

const SECRET = "webhook-secret";
const sign = (body: string, secret = SECRET) =>
	`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const headers = (over: Record<string, string> = {}) => new Headers(over);
const eventHeaders = () => headers({ "x-github-event": "dependabot_alert" });

const delivery = (over: Record<string, unknown> = {}) => ({
	action: "created",
	repository: { full_name: "theholocron/holocron", html_url: "https://github.com/theholocron/holocron" },
	alert: {
		number: 12,
		html_url: "https://github.com/theholocron/holocron/security/dependabot/12",
		dependency: {
			manifest_path: "pnpm-lock.yaml",
			vulnerable_version_range: "< 2.0.0",
			first_patched_version: { identifier: "2.0.0" },
			package: { name: "example", ecosystem: "npm" },
		},
		security_advisory: { ghsa_id: "GHSA-1234", summary: "A sample vulnerability", severity: "high" },
	},
	...over,
});

describe("dependabot.verify", () => {
	const body = JSON.stringify(delivery());

	it("accepts GitHub's sha256 HMAC of the raw request body", async () => {
		expect(await dependabot.verify(headers({ "x-hub-signature-256": sign(body) }), body, SECRET)).toBe(true);
	});

	it("refuses a missing, malformed, wrong or differently signed signature and a missing secret", async () => {
		for (const [signature, secret] of [
			[undefined, SECRET],
			["sha1=abcd", SECRET],
			["sha256=deadbeef", SECRET],
			[sign(body, "other secret"), SECRET],
			[sign(body), ""],
		] as const) {
			expect(
				await dependabot.verify(headers(signature ? { "x-hub-signature-256": signature } : {}), body, secret)
			).toBe(false);
		}
	});

	it("refuses a re-spaced body", async () => {
		expect(
			await dependabot.verify(
				headers({ "x-hub-signature-256": sign(body) }),
				JSON.stringify(delivery(), null, 2),
				SECRET
			)
		).toBe(false);
	});
});

describe("dependabot.format", () => {
	it("formats an alert with pings off and useful dependency details", () => {
		const result = dependabot.format(eventHeaders(), delivery())!;
		expect(result.username).toBe("Dependabot");
		expect(result.allowed_mentions).toEqual({ parse: [] });
		expect(result.embeds[0]).toMatchObject({
			title: "New vulnerability: example #12",
			description: "A sample vulnerability",
			url: "https://github.com/theholocron/holocron/security/dependabot/12",
			color: 0xe5484d,
		});
		expect(result.embeds[0]!.fields!.map((field) => field.name)).toEqual([
			"Repository",
			"Severity",
			"Vulnerable versions",
			"First patched version",
			"Manifest",
			"Advisory",
		]);
	});

	it("drops non-Dependabot GitHub events and actions it does not carry", () => {
		expect(dependabot.format(headers({ "x-github-event": "push" }), delivery())).toBeNull();
		expect(dependabot.format(eventHeaders(), delivery({ action: "assignees_changed" }))).toBeNull();
	});

	it("formats each supported lifecycle action", () => {
		for (const [action, title, color] of [
			["created", "New vulnerability", 0xe5484d],
			["auto_reopened", "Vulnerability reopened", 0xe5484d],
			["reopened", "Vulnerability reopened", 0xe5484d],
			["reintroduced", "Vulnerability reintroduced", 0xe5484d],
			["dismissed", "Vulnerability dismissed", 0x889096],
			["auto_dismissed", "Vulnerability dismissed", 0x889096],
			["fixed", "Vulnerability fixed", 0x30a46c],
			["withdrawn", "Advisory withdrawn", 0x889096],
		] as const) {
			const result = dependabot.format(eventHeaders(), delivery({ action }))!;
			expect(result.embeds[0]!.title).toContain(title);
			expect(result.embeds[0]!.color).toBe(color);
		}
	});

	it("uses safe fallbacks and omits optional fields", () => {
		const result = dependabot.format(
			eventHeaders(),
			delivery({
				repository: {},
				alert: {
					dependency: { package: {}, first_patched_version: null },
					security_advisory: { summary: "", severity: "" },
					html_url: "javascript:alert(1)",
				},
			})
		)!;
		expect(result.embeds[0]!.title).toBe("New vulnerability: dependency");
		expect(result.embeds[0]!.description).toBe("dependency has a security alert");
		expect(result.embeds[0]!.url).toBeUndefined();
		expect(result.embeds[0]!.fields).toEqual([
			{ name: "Repository", value: "repository", inline: true },
			{ name: "Severity", value: "unknown", inline: true },
		]);
	});

	it("rejects malformed carried payloads", () => {
		for (const bad of [null, {}, { action: 1 }, delivery({ alert: undefined })]) {
			expect(() => dependabot.format(eventHeaders(), bad)).toThrow(MalformedDelivery);
		}
	});
});
