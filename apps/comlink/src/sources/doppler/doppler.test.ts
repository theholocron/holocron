import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { MalformedDelivery } from "../source.type.js";
import { doppler } from "./doppler.js";

const SECRET = "signing-secret";
const sign = (text: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(text).digest("hex")}`;
const headers = (over: Record<string, string> = {}) => new Headers(over);

const delivery = (over: Record<string, unknown> = {}) => ({
	type: "config.secrets.update",
	config: { name: "dev", environment: "dev", slug: "dev" },
	project: { id: "p1", slug: "holocron", name: "holocron" },
	workplace: { id: "w1", name: "theholocron" },
	diff: { added: ["NEW_KEY"], removed: ["OLD_KEY"], updated: ["CHANGED_KEY"] },
	...over,
});

describe("doppler.verify", () => {
	const body = JSON.stringify(delivery());

	it("accepts the body signed with sha256= and HMAC-SHA256 under the secret", async () => {
		expect(await doppler.verify(headers({ "x-doppler-signature": sign(body) }), body, SECRET)).toBe(true);
	});

	it("refuses no signature, a wrong one, another secret, no prefix, an empty one, or no secret", async () => {
		const bare = sign(body).slice("sha256=".length);
		for (const [signature, secret] of [
			[undefined, SECRET],
			["sha256=deadbeef", SECRET],
			["", SECRET],
			[sign(body, "other"), SECRET],
			[bare, SECRET],
			[sign(body), ""],
		] as const) {
			const h = headers(signature === undefined ? {} : { "x-doppler-signature": signature });
			expect(await doppler.verify(h, body, secret)).toBe(false);
		}
	});

	it("refuses a re-spaced body", async () => {
		const pretty = JSON.stringify(delivery(), null, 2);
		expect(await doppler.verify(headers({ "x-doppler-signature": sign(body) }), pretty, SECRET)).toBe(false);
	});
});

describe("doppler.format", () => {
	it("turns a secrets update into one embed with pings off, names only", () => {
		const m = doppler.format(headers(), delivery())!;
		expect(m.username).toBe("Doppler");
		expect(m.allowed_mentions).toEqual({ parse: [] });
		expect(m.embeds).toHaveLength(1);
		expect(m.embeds[0]!.title).toBe("Secrets changed: holocron / dev");
		const fields = m.embeds[0]!.fields!;
		expect(fields.map((f) => f.name)).toEqual(["Project", "Config", "Added", "Updated", "Removed"]);
		expect(fields.find((f) => f.name === "Added")!.value).toBe("NEW_KEY");
	});

	it("leaves out empty lists and falls back on slugs", () => {
		const m = doppler.format(
			headers(),
			delivery({ project: { slug: "p" }, config: { slug: "stg" }, diff: { updated: ["A", "B", 3] } })
		)!;
		expect(m.embeds[0]!.title).toBe("Secrets changed: p / stg");
		expect(m.embeds[0]!.fields!.map((f) => f.name)).toEqual(["Project", "Config", "Updated"]);
		expect(m.embeds[0]!.fields![2]!.value).toBe("A, B");
	});

	it("names the config by its environment when it has no name or slug, and by a plain word when it has nothing", () => {
		const byEnvironment = doppler.format(
			headers(),
			delivery({ project: {}, config: { environment: "prd" }, diff: {} })
		)!;
		expect(byEnvironment.embeds[0]!.title).toBe("Secrets changed: project / prd");
		const bare = doppler.format(headers(), delivery({ project: undefined, config: {}, diff: undefined }))!;
		expect(bare.embeds[0]!.title).toBe("Secrets changed: project / config");
		expect(bare.embeds[0]!.fields!.map((f) => f.name)).toEqual(["Project", "Config"]);
	});

	it("returns null for a type it does not carry", () => {
		expect(doppler.format(headers(), delivery({ type: "config.created" }))).toBeNull();
	});

	it("throws MalformedDelivery for no type, a non-object, or no config", () => {
		for (const bad of [null, {}, { type: 1 }, { type: "config.secrets.update" }]) {
			expect(() => doppler.format(headers(), bad)).toThrow(MalformedDelivery);
		}
	});
});
