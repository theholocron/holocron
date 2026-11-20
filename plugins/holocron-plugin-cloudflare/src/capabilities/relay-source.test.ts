import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { cfOk } from "../helpers.js";
import { createCloudflareClient } from "../rest.js";
import { CloudflareDns } from "./dns.js";

const BASE = "https://cf.test/client/v4";
const URL = "https://comlink.example.dev/cloudflare";
const SECRET = "s3cr3t-value";
const input = { source: "cloudflare", url: URL, name: "Cloudflare", events: ["incident_alert"], secret: SECRET };

function make(responses: Parameters<typeof stubFetch>[0], accountId: string | null = "acct") {
	const { fetch, calls } = stubFetch(responses);
	const client = createCloudflareClient({ token: "cf-tok", baseUrl: BASE, fetch, retryDelayMs: 0 });
	return { dns: new CloudflareDns(() => client, accountId ?? undefined), calls };
}

const destination = { id: "d1", name: "Cloudflare", url: URL, type: "generic" };
const policy = {
	id: "p1",
	name: "Cloudflare: incident_alert",
	alert_type: "incident_alert",
	enabled: true,
	mechanisms: { webhooks: [{ id: "d1" }] },
};

describe("CloudflareDns.ensureRelaySource", () => {
	it("makes the destination with the offered secret and one policy per alert type, and returns the secret", async () => {
		const { dns, calls } = make([cfOk([]), cfOk({ id: "d1" }), cfOk([]), cfOk({ id: "p1" }), cfOk({ id: "p2" })]);
		const result = await dns.ensureRelaySource({ ...input, events: ["incident_alert", "dos_attack_l7"] });
		expect(calls).toHaveLength(5);
		expect(result.created).toBe(true);
		expect(result.secret).toBe(SECRET);
		expect(calls[1]).toMatchObject({ method: "POST", body: { name: "Cloudflare", url: URL, secret: SECRET } });
		expect(calls[3]?.body).toEqual({
			name: "Cloudflare: incident_alert",
			alert_type: "incident_alert",
			enabled: true,
			mechanisms: { webhooks: [{ id: "d1" }] },
		});
	});

	it("changes nothing the second time and returns no secret", async () => {
		const { dns, calls } = make([cfOk([destination]), cfOk([policy])]);
		const result = await dns.ensureRelaySource(input);
		expect(result).toEqual({ created: false, updated: [] });
		expect(calls.map((c) => c.method)).toEqual(["GET", "GET"]);
	});

	it("makes a missing policy for an adopted destination without a secret", async () => {
		const { dns } = make([cfOk([destination]), cfOk([]), cfOk({ id: "p1" })]);
		const result = await dns.ensureRelaySource(input);
		expect(result).toEqual({ created: false, updated: ["policy incident_alert"] });
	});

	it("turns a disabled policy on, keeping what it had", async () => {
		const off = {
			...policy,
			enabled: false,
			description: "mine",
			mechanisms: { email: [{ id: "a@b.c" }], webhooks: [{ id: "d1" }] },
		};
		const { dns, calls } = make([cfOk([destination]), cfOk([off]), cfOk({ id: "p1" })]);
		const result = await dns.ensureRelaySource(input);
		expect(result.updated).toEqual(["policy incident_alert"]);
		expect(calls[2]).toMatchObject({
			method: "PUT",
			body: {
				enabled: true,
				description: "mine",
				mechanisms: { email: [{ id: "a@b.c" }], webhooks: [{ id: "d1" }] },
			},
		});
	});

	it("adds the destination to a policy that does not name it", async () => {
		const { dns, calls } = make([
			cfOk([destination]),
			cfOk([{ ...policy, mechanisms: { webhooks: [{ id: "other" }] } }]),
			cfOk({ id: "p1" }),
		]);
		await dns.ensureRelaySource(input);
		expect((calls[2]?.body as { mechanisms: unknown }).mechanisms).toEqual({
			webhooks: [{ id: "other" }, { id: "d1" }],
		});
	});

	it("returns a todo, and makes no policy, when the layout names no alert type", async () => {
		const { dns, calls } = make([cfOk([destination])]);
		const result = await dns.ensureRelaySource({ ...input, events: undefined });
		expect(result.todo?.[0]).toMatch(/events/);
		expect(calls).toHaveLength(1);
	});

	it("makes the destination without a secret when none is offered, and returns none", async () => {
		const { dns, calls } = make([cfOk([]), cfOk({ id: "d1" }), cfOk([]), cfOk({ id: "p1" })]);
		const result = await dns.ensureRelaySource({ ...input, secret: undefined });
		expect(result.created).toBe(true);
		expect(result).not.toHaveProperty("secret");
		expect(calls[1]?.body).toEqual({ name: "Cloudflare", url: URL });
	});

	it("keeps a policy's description, filters and interval when it fixes the policy, and adds the destination to a policy with no webhooks", async () => {
		const bare = {
			...policy,
			enabled: false,
			mechanisms: {},
			description: "d",
			filters: { zones: ["z"] },
			alert_interval: "PT5M",
		};
		const { dns, calls } = make([cfOk([destination]), cfOk([bare]), cfOk({ id: "p1" })]);
		await dns.ensureRelaySource(input);
		expect(calls[2]?.body).toEqual({
			name: "Cloudflare: incident_alert",
			alert_type: "incident_alert",
			enabled: true,
			mechanisms: { webhooks: [{ id: "d1" }] },
			description: "d",
			filters: { zones: ["z"] },
			alert_interval: "PT5M",
		});
	});

	it("leaves another source's policies alone", async () => {
		const other = { ...policy, id: "p9", name: "Other: incident_alert", mechanisms: {} };
		const { dns, calls } = make([cfOk([destination]), cfOk([other]), cfOk({ id: "p1" })]);
		const result = await dns.ensureRelaySource(input);
		expect(result.updated).toEqual(["policy incident_alert"]);
		expect(calls[2]?.method).toBe("POST");
	});

	it("passes on a refusal from Cloudflare, and creates nothing after a failed list", async () => {
		const denied = {
			status: 403,
			body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] },
		};
		const { dns, calls } = make([denied]);
		await expect(dns.ensureRelaySource(input)).rejects.toThrow();
		expect(calls).toHaveLength(1);
	});

	it("stops, with the destination made, when the policy call is refused", async () => {
		const denied = {
			status: 403,
			body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] },
		};
		const { dns, calls } = make([cfOk([]), cfOk({ id: "d1" }), cfOk([]), denied]);
		await expect(dns.ensureRelaySource(input)).rejects.toThrow();
		expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "GET", "POST"]);
	});

	it("fails when the destination cannot be made", async () => {
		const unauthorized = { status: 401, body: { success: false, errors: [{ code: 10000, message: "bad token" }] } };
		const { dns, calls } = make([cfOk([]), unauthorized]);
		await expect(dns.ensureRelaySource(input)).rejects.toThrow();
		expect(calls).toHaveLength(2);
	});

	it("returns the secret of a destination made now even when it also reports the todo", async () => {
		const { dns, calls } = make([cfOk([]), cfOk({ id: "d1" })]);
		const result = await dns.ensureRelaySource({ ...input, events: [] });
		expect(result.secret).toBe(SECRET);
		expect(result.todo).toHaveLength(1);
		expect(calls).toHaveLength(2);
	});

	it("needs an account id", async () => {
		const { dns } = make([], null);
		await expect(dns.ensureRelaySource(input)).rejects.toThrow(/accountId/);
	});
});

describe("CloudflareDns.inspectRelaySource", () => {
	it("says there is no webhook when none has the URL", async () => {
		const { dns } = make([cfOk([])]);
		expect(await dns.inspectRelaySource(input)).toEqual({ exists: false });
	});

	it("reports the alert types sent to the destination, and that they are on", async () => {
		const { dns } = make([cfOk([destination]), cfOk([policy])]);
		expect(await dns.inspectRelaySource(input)).toEqual({
			exists: true,
			enabled: true,
			events: ["incident_alert"],
		});
	});

	it("ignores policies that do not send to the destination, and other sources' policies", async () => {
		const elsewhere = {
			...policy,
			id: "p2",
			name: "Cloudflare: dos_attack_l7",
			mechanisms: { webhooks: [{ id: "x" }] },
		};
		const bare = { ...policy, id: "p3", name: "Cloudflare: other", mechanisms: {} };
		const foreign = { ...policy, id: "p4", name: "Else: incident_alert" };
		const { dns } = make([cfOk([destination]), cfOk([policy, elsewhere, bare, foreign])]);
		expect(await dns.inspectRelaySource(input)).toEqual({
			exists: true,
			enabled: true,
			events: ["incident_alert"],
		});
	});

	it("passes on a refusal when reading the webhooks or the policies", async () => {
		const denied = { status: 403, body: { success: false, errors: [{ code: 10000, message: "no" }] } };
		await expect(make([denied]).dns.inspectRelaySource(input)).rejects.toThrow();
		await expect(make([cfOk([destination]), denied]).dns.inspectRelaySource(input)).rejects.toThrow();
	});

	it("needs an account id", async () => {
		await expect(make([], null).dns.inspectRelaySource(input)).rejects.toThrow(/accountId/);
	});

	it("reports off when a policy is disabled or there is none", async () => {
		const off = make([cfOk([destination]), cfOk([{ ...policy, enabled: false }])]);
		expect((await off.dns.inspectRelaySource(input)).enabled).toBe(false);
		const none = make([cfOk([destination]), cfOk([])]);
		expect(await none.dns.inspectRelaySource(input)).toEqual({ exists: true, enabled: false, events: [] });
	});
});
