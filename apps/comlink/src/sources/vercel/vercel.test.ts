import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { MalformedDelivery } from "../source.type.js";
import { vercel } from "./vercel.js";

const SECRET = "webhook-secret";
const sign = (text: string, secret = SECRET) => createHmac("sha1", secret).update(text).digest("hex");
const headers = (over: Record<string, string> = {}) => new Headers(over);

const delivery = (type = "deployment.error", payload: Record<string, unknown> = {}) => ({
	id: "evt_1",
	type,
	createdAt: 1_790_000_000_000,
	payload: {
		name: "holocron-docs",
		target: "production",
		links: { deployment: "https://vercel.com/team/docs/abc", project: "https://vercel.com/team/docs" },
		deployment: {
			id: "dpl_1",
			name: "holocron-docs",
			url: "docs-abc.vercel.app",
			meta: { githubCommitRef: "main", githubCommitMessage: "fix: stuff" },
		},
		...payload,
	},
});

describe("vercel.verify", () => {
	const body = JSON.stringify(delivery());

	it("accepts the body signed with HMAC-SHA1 under the secret", async () => {
		expect(await vercel.verify(headers({ "x-vercel-signature": sign(body) }), body, SECRET)).toBe(true);
	});

	it("refuses no signature, a wrong one, one under another secret, an empty one, a SHA-256 one, or no secret", async () => {
		const sha256 = createHmac("sha256", SECRET).update(body).digest("hex");
		for (const [signature, secret] of [
			[undefined, SECRET],
			["deadbeef", SECRET],
			["", SECRET],
			[sign(body, "other"), SECRET],
			[sha256, SECRET],
			[sign(body), ""],
		] as const) {
			const h = headers(signature === undefined ? {} : { "x-vercel-signature": signature });
			expect(await vercel.verify(h, body, secret)).toBe(false);
		}
	});

	it("refuses a re-spaced body", async () => {
		const pretty = JSON.stringify(delivery(), null, 2);
		expect(await vercel.verify(headers({ "x-vercel-signature": sign(body) }), pretty, SECRET)).toBe(false);
	});
});

describe("vercel.format", () => {
	it("turns a failed deployment into one embed with pings off", () => {
		const m = vercel.format(headers(), delivery())!;
		expect(m.username).toBe("Vercel");
		expect(m.allowed_mentions).toEqual({ parse: [] });
		expect(m.embeds).toHaveLength(1);
		expect(m.embeds[0]).toMatchObject({
			title: "Deployment failed: holocron-docs",
			description: "fix: stuff",
			url: "https://vercel.com/team/docs/abc",
			color: 0xe5484d,
			timestamp: new Date(1_790_000_000_000).toISOString(),
		});
		expect(m.embeds[0]!.fields).toEqual([
			{ name: "Project", value: "holocron-docs", inline: true },
			{ name: "Target", value: "production", inline: true },
			{ name: "Branch", value: "main", inline: true },
		]);
	});

	it("labels and colours each carried event", () => {
		for (const [type, title, color] of [
			["deployment.created", "Deployment started: holocron-docs", 0x3e63dd],
			["deployment.ready", "Deployment ready: holocron-docs", 0x30a46c],
			["deployment.succeeded", "Deployment succeeded: holocron-docs", 0x30a46c],
			["deployment.promoted", "Deployment promoted: holocron-docs", 0x30a46c],
			["deployment.error", "Deployment failed: holocron-docs", 0xe5484d],
			["deployment.canceled", "Deployment canceled: holocron-docs", 0x889096],
		] as const) {
			expect(vercel.format(headers(), delivery(type))!.embeds[0]).toMatchObject({ title, color });
		}
	});

	it("falls back to the deployment's host, a preview target and the payload name, and leaves out what is missing", () => {
		const m = vercel.format(
			headers(),
			delivery("deployment.created", {
				name: "outer",
				target: null,
				links: {},
				deployment: { id: "d", url: "docs-abc.vercel.app" },
			})
		)!;
		const embed = m.embeds[0]!;
		expect(embed.title).toBe("Deployment started: outer");
		expect(embed.url).toBe("https://docs-abc.vercel.app");
		expect(embed.fields).toContainEqual({ name: "Target", value: "preview", inline: true });
		expect(embed).not.toHaveProperty("description");
		expect(embed.fields!.map((f) => f.name)).not.toContain("Branch");
	});

	it("keeps a deployment host that already has a scheme, and links nothing when no address is usable", () => {
		const withScheme = delivery("deployment.error", {
			links: {},
			deployment: { name: "a", url: "http://x.test/d" },
		});
		expect(vercel.format(headers(), withScheme)!.embeds[0]!.url).toBe("http://x.test/d");
		for (const url of [undefined, "", 7]) {
			const none = delivery("deployment.error", { links: {}, deployment: { name: "a", url } });
			expect(vercel.format(headers(), none)!.embeds[0]).not.toHaveProperty("url");
		}
	});

	it("titles a deployment with no name anywhere 'deployment'", () => {
		const m = vercel.format(headers(), delivery("deployment.error", { name: undefined, deployment: { id: "d" } }))!;
		expect(m.embeds[0]!.title).toBe("Deployment failed: deployment");
	});

	it("drops a link that is not http(s) and a missing time", () => {
		const { createdAt: _t, ...noTime } = delivery("deployment.error", {
			links: { deployment: "javascript:alert(1)" },
		});
		const embed = vercel.format(headers(), noTime)!.embeds[0]!;
		expect(embed.url).toBe("https://docs-abc.vercel.app");
		expect(embed).not.toHaveProperty("timestamp");
	});

	it("keeps text inside Discord's limits", () => {
		const embed = vercel.format(
			headers(),
			delivery("deployment.error", {
				deployment: { name: "n".repeat(500), meta: { githubCommitMessage: "m".repeat(5000) } },
			})
		)!.embeds[0]!;
		expect(embed.title).toHaveLength(256);
		const total =
			embed.title!.length +
			(embed.description?.length ?? 0) +
			embed.fields!.reduce((n, f) => n + f.name.length + f.value.length, 0);
		expect(total).toBeLessThanOrEqual(6000);
	});

	it("drops an event it does not carry, and rejects one it cannot read", () => {
		expect(vercel.format(headers(), delivery("project.created"))).toBeNull();
		expect(vercel.format(headers(), delivery("deployment.check-rerequested"))).toBeNull();
		expect(() => vercel.format(headers(), { type: "deployment.error", payload: {} })).toThrow(MalformedDelivery);
		expect(() => vercel.format(headers(), { payload: {} })).toThrow(MalformedDelivery);
		expect(() => vercel.format(headers(), null)).toThrow(MalformedDelivery);
	});
});
