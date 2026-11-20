import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MalformedDelivery } from "../source.type.js";
import { clerk, TOLERANCE_SECONDS } from "./clerk.js";

const KEY = Buffer.from("a-signing-key-of-some-length-123");
const SECRET = `whsec_${KEY.toString("base64")}`;
const NOW = 1_790_000_000;
const sign = (id: string, ts: string | number, body: string, key = KEY) =>
	`v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
const headers = (id: string | null, ts: string | null, sig: string | null) => {
	const h = new Headers();
	if (id !== null) h.set("svix-id", id);
	if (ts !== null) h.set("svix-timestamp", ts);
	if (sig !== null) h.set("svix-signature", sig);
	return h;
};

const delivery = (type: string, data: Record<string, unknown>) => ({
	object: "event",
	type,
	timestamp: 1_790_000_000_000,
	instance_id: "ins_1",
	data,
});

describe("clerk.verify", () => {
	const body = JSON.stringify(delivery("user.created", { id: "user_1" }));
	const ts = String(NOW);
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW * 1000);
	});
	afterEach(() => vi.useRealTimers());

	it("accepts the id, timestamp and body signed under the decoded secret", async () => {
		expect(await clerk.verify(headers("msg_1", ts, sign("msg_1", ts, body)), body, SECRET)).toBe(true);
	});

	it("accepts a secret without the whsec_ prefix", async () => {
		const bare = KEY.toString("base64");
		expect(await clerk.verify(headers("msg_1", ts, sign("msg_1", ts, body)), body, bare)).toBe(true);
	});

	it("accepts when any one of several space-separated signatures matches, and ignores other versions", async () => {
		const good = sign("msg_1", ts, body);
		const stale = sign("msg_1", ts, body, Buffer.from("rotated-out-key"));
		for (const sig of [`${stale} ${good}`, `${good} ${stale}`, `v2,abc ${good}`]) {
			expect(await clerk.verify(headers("msg_1", ts, sig), body, SECRET)).toBe(true);
		}
	});

	it("refuses a missing header, a wrong or other-keyed signature, another id or timestamp, and a bad secret", async () => {
		const good = sign("msg_1", ts, body);
		const cases: Array<[string | null, string | null, string | null, string]> = [
			[null, ts, good, SECRET],
			["msg_1", null, good, SECRET],
			["msg_1", ts, null, SECRET],
			["msg_1", ts, "v1,AAAA", SECRET],
			["msg_1", ts, "AAAA", SECRET],
			["msg_1", ts, "v2," + good.slice(3), SECRET],
			["msg_1", ts, sign("msg_1", ts, body, Buffer.from("other")), SECRET],
			["msg_2", ts, good, SECRET],
			["msg_1", String(NOW + 1), good, SECRET],
			["msg_1", ts, good, ""],
			["msg_1", ts, good, "whsec_%%%not-base64"],
			["msg_1", ts, good, "whsec_"],
		];
		for (const [id, t, sig, secret] of cases) {
			expect(await clerk.verify(headers(id, t, sig), body, secret)).toBe(false);
		}
	});

	it("refuses a re-spaced body", async () => {
		const pretty = JSON.stringify(JSON.parse(body), null, 2);
		expect(await clerk.verify(headers("msg_1", ts, sign("msg_1", ts, body)), pretty, SECRET)).toBe(false);
	});

	it("refuses a stale or future timestamp even when correctly signed, and a non-numeric one", async () => {
		for (const t of [String(NOW - TOLERANCE_SECONDS - 1), String(NOW + TOLERANCE_SECONDS + 1), "abc", "1.5e9"]) {
			expect(await clerk.verify(headers("msg_1", t, sign("msg_1", t, body)), body, SECRET)).toBe(false);
		}
		const edge = String(NOW - TOLERANCE_SECONDS);
		expect(await clerk.verify(headers("msg_1", edge, sign("msg_1", edge, body)), body, SECRET)).toBe(true);
	});
});

describe("clerk.format", () => {
	const h = new Headers();

	it("formats a user event with name and id, pings off", () => {
		const m = clerk.format(
			h,
			delivery("user.created", { id: "user_1", first_name: "Ada", last_name: "Lovelace" })
		)!;
		expect(m.username).toBe("Clerk");
		expect(m.allowed_mentions).toEqual({ parse: [] });
		expect(m.embeds[0]).toMatchObject({
			title: "User created: Ada Lovelace",
			color: 0x30a46c,
			timestamp: new Date(1_790_000_000_000).toISOString(),
		});
		expect(m.embeds[0]!.fields).toEqual([
			{ name: "User", value: "Ada Lovelace", inline: true },
			{ name: "Id", value: "user_1", inline: true },
		]);
	});

	it("falls back to the username, and to a bare label for a deleted user with only an id", () => {
		expect(clerk.format(h, delivery("user.created", { id: "u", username: "ada" }))!.embeds[0]!.title).toBe(
			"User created: ada"
		);
		const deleted = clerk.format(h, delivery("user.deleted", { id: "user_9", deleted: true }))!.embeds[0]!;
		expect(deleted).toMatchObject({ title: "User deleted", color: 0xe5484d });
		expect(deleted.fields).toEqual([{ name: "Id", value: "user_9", inline: true }]);
	});

	it("formats organization and membership events", () => {
		const org = clerk.format(h, delivery("organization.created", { id: "org_1", name: "Rebels", slug: "rebels" }))!;
		expect(org.embeds[0]).toMatchObject({ title: "Organization created: Rebels" });
		const gone = clerk.format(h, delivery("organization.deleted", { id: "org_1", slug: "rebels" }))!;
		expect(gone.embeds[0]).toMatchObject({ title: "Organization deleted: rebels", color: 0xe5484d });
		const member = clerk.format(
			h,
			delivery("organizationMembership.created", {
				role: "org:admin",
				organization: { name: "Rebels", slug: "rebels" },
				public_user_data: {
					first_name: "Leia",
					last_name: "Organa",
					identifier: "leia@example.com",
					user_id: "u",
				},
			})
		)!;
		expect(member.embeds[0]).toMatchObject({ title: "Member added: Leia Organa", color: 0x3e63dd });
		expect(member.embeds[0]!.fields).toEqual([
			{ name: "Member", value: "Leia Organa", inline: true },
			{ name: "Organization", value: "Rebels", inline: true },
			{ name: "Role", value: "org:admin", inline: true },
		]);
		const removed = clerk.format(
			h,
			delivery("organizationMembership.deleted", {
				organization: { slug: "rebels" },
				public_user_data: { identifier: "han" },
			})
		)!;
		expect(removed.embeds[0]).toMatchObject({ title: "Member removed: han", color: 0xf5a623 });
		expect(removed.embeds[0]!.fields![1]).toEqual({ name: "Organization", value: "rebels", inline: true });
	});

	it("leaves out a missing time and keeps text inside Discord's limits", () => {
		const { timestamp: _t, ...noTime } = delivery("user.created", { first_name: "x".repeat(500) });
		const embed = clerk.format(h, noTime)!.embeds[0]!;
		expect(embed).not.toHaveProperty("timestamp");
		expect(embed.title).toHaveLength(256);
		expect(embed.fields![0]!.value).toHaveLength(500);
	});

	it("drops an event it does not carry, and rejects one it cannot read", () => {
		expect(clerk.format(h, delivery("session.created", { id: "s" }))).toBeNull();
		expect(clerk.format(h, delivery("email.created", {}))).toBeNull();
		expect(() => clerk.format(h, { type: "user.created" })).toThrow(MalformedDelivery);
		expect(() => clerk.format(h, { type: "user.created", data: null })).toThrow(MalformedDelivery);
		expect(() => clerk.format(h, { data: {} })).toThrow(MalformedDelivery);
		expect(() => clerk.format(h, null)).toThrow(MalformedDelivery);
	});
});
