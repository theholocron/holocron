import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createChecklyClient } from "../rest.js";
import { ChecklyMonitoring } from "./monitoring.js";

const INPUT = {
	name: "The Holocron",
	slug: "theholocron",
	domain: "status.theholocron.dev",
	components: [
		{ name: "Sentinel", tags: ["sentinel"], group: "Services" },
		{ name: "Comlink", tags: ["comlink"], group: "Services" },
		{ name: "Docs", tags: ["docs"] },
	],
};

function capability(responses: Array<{ status?: number; body?: unknown }>) {
	const stub = stubFetch(responses);
	const client = createChecklyClient({ token: "t", accountId: "acct", fetch: stub.fetch });
	return { monitoring: new ChecklyMonitoring(() => client, { statusPages: [INPUT] }), stub };
}

const list = (...entries: unknown[]) => ({ body: { length: entries.length, entries, nextId: null } });
const page = (extra: object = {}) => ({
	id: "p1",
	name: "The Holocron",
	url: "theholocron",
	customDomain: "status.theholocron.dev",
	isPrivate: false,
	accountId: "acct",
	version: 3,
	created_at: "2026-01-01",
	...extra,
});
const component = (id: string, name: string, extra: object = {}) => ({
	id,
	name,
	type: "SERVICE",
	displayOrder: 0,
	hidden: false,
	parentId: null,
	configuration: { showHistoricalData: true },
	statusPageId: "p1",
	created_at: "2026-01-01",
	...extra,
});
const rule = (id: string, name: string, tags: string[], componentId: string, extra: object = {}) => ({
	id,
	name,
	tags,
	firstUpdate: "down",
	lastUpdate: "up",
	enabled: true,
	components: [{ id: `${id}-c`, componentId, targetImpact: "MAJOR_OUTAGE" }],
	statusPageId: "p1",
	created_at: "2026-01-01",
	...extra,
});
/** The three components and rules of INPUT, as they should be. */
const goodComponents = () =>
	list(
		component("g1", "Services", { type: "GROUP", displayOrder: 0 }),
		component("s1", "Sentinel", { parentId: "g1", displayOrder: 0 }),
		component("s2", "Comlink", { parentId: "g1", displayOrder: 1 }),
		component("s3", "Docs", { displayOrder: 1 })
	);
const goodRules = () =>
	list(
		rule("r1", "Sentinel", ["sentinel"], "s1"),
		rule("r2", "Comlink", ["comlink"], "s2"),
		rule("r3", "Docs", ["docs"], "s3")
	);
const active = { body: { status: "active", sslStatus: "active" } };

describe("ensureStatusPage", () => {
	it("makes the page, its group, components and one rule each, public, and reports the domain record to make", async () => {
		const pending = {
			body: {
				status: "pending",
				sslStatus: "pending_validation",
				CNAME: "status-target.example.net",
				ownershipVerification: { type: "txt", name: "_own.status.theholocron.dev", value: "abc" },
				validationRecords: [{ status: "pending", txt_name: "_acme.status.theholocron.dev", txt_value: "xyz" }],
			},
		};
		const { monitoring, stub } = capability([
			list(), // pages
			{ status: 201, body: page() },
			list(), // components
			{ status: 201, body: component("g1", "Services", { type: "GROUP" }) },
			{ status: 201, body: component("s1", "Sentinel") },
			{ status: 201, body: component("s2", "Comlink") },
			{ status: 201, body: component("s3", "Docs") },
			list(), // rules
			{ status: 201, body: {} },
			{ status: 201, body: {} },
			{ status: 201, body: {} },
			pending, // verification
			pending, // recheck
		]);
		const result = await monitoring.ensureStatusPage(INPUT);

		expect(result).toMatchObject({
			id: "p1",
			created: true,
			components: { created: ["Services", "Sentinel", "Comlink", "Docs"], updated: [] },
			rules: { created: ["Sentinel", "Comlink", "Docs"], updated: [] },
			domain: {
				name: "status.theholocron.dev",
				verified: false,
				record: { type: "CNAME", name: "status.theholocron.dev", value: "status-target.example.net" },
				extraRecords: [
					{ type: "TXT", name: "_own.status.theholocron.dev", value: "abc" },
					{ type: "TXT", name: "_acme.status.theholocron.dev", value: "xyz" },
				],
			},
		});
		const writes = stub.calls.filter((c) => c.method !== "GET");
		expect(writes[0]?.body).toMatchObject({
			name: "The Holocron",
			url: "theholocron",
			customDomain: "status.theholocron.dev",
			isPrivate: false,
		});
		expect(writes[1]?.body).toMatchObject({ name: "Services", type: "GROUP", displayOrder: 0 });
		expect(writes[2]?.body).toMatchObject({ name: "Sentinel", parentId: "g1", displayOrder: 0 });
		expect(writes[3]?.body).toMatchObject({ name: "Comlink", parentId: "g1", displayOrder: 1 });
		expect(writes[4]?.body).toMatchObject({ name: "Docs", displayOrder: 1 });
		expect(writes[4]?.body).not.toHaveProperty("parentId");
		expect(writes[5]?.body).toMatchObject({
			name: "Sentinel",
			tags: ["sentinel"],
			components: [{ componentId: "s1", targetImpact: "MAJOR_OUTAGE" }],
		});
		expect(stub.calls.at(-1)?.url).toContain("/custom-domain-verifications/recheck");
	});

	it("writes nothing when the account already matches, and does not recheck a verified domain", async () => {
		const { monitoring, stub } = capability([list(page()), goodComponents(), goodRules(), active]);
		const result = await monitoring.ensureStatusPage(INPUT);
		expect(result).toMatchObject({
			created: false,
			components: { created: [], updated: [] },
			rules: { created: [], updated: [] },
			domain: { verified: true },
		});
		expect(result.updated).toBeUndefined();
		expect(stub.calls.every((c) => c.method === "GET")).toBe(true);
	});

	it("writes the footer, the policy links and the support link in Checkly's names", async () => {
		const { monitoring, stub } = capability([
			list(page({ footerText: "old" })),
			{ status: 200, body: page() }, // PUT
			goodComponents(),
			goodRules(),
			active,
		]);
		const result = await monitoring.ensureStatusPage({
			...INPUT,
			footer: "The Holocron",
			privacyUrl: "https://example.com/privacy/",
			termsUrl: "https://example.com/terms/",
			supportUrl: "https://example.com/",
		});
		expect(result.updated).toEqual(["footerText", "privacyPolicyLink", "termsOfServiceLink", "supportLink"]);
		expect(stub.calls.find((c) => c.method === "PUT")?.body).toMatchObject({
			footerText: "The Holocron",
			privacyPolicyLink: "https://example.com/privacy/",
			termsOfServiceLink: "https://example.com/terms/",
			supportLink: "https://example.com/",
		});
	});

	const CSS_402 = {
		status: 402,
		body: { message: "Custom CSS for status pages is not part of your plan. Upgrade your plan to use custom CSS." },
	};

	it("sends the update again without themeColors when the plan refuses custom CSS", async () => {
		const { monitoring, stub } = capability([
			list(page({ footerText: "old", themeColors: { light: {}, dark: {} } })),
			CSS_402,
			{ status: 200, body: page() }, // PUT again
			goodComponents(),
			goodRules(),
			active,
		]);
		const result = await monitoring.ensureStatusPage({ ...INPUT, footer: "new" });
		expect(result.updated).toEqual(["footerText"]);
		const puts = stub.calls.filter((c) => c.method === "PUT");
		expect(puts).toHaveLength(2);
		expect(puts[0]?.body).toHaveProperty("themeColors");
		expect(puts[1]?.body).not.toHaveProperty("themeColors");
		expect(puts[1]?.body).toMatchObject({ footerText: "new" });
	});

	it("throws a 402 that is not about styling, and one when there are no theme colours to leave out", async () => {
		const other = capability([
			list(page({ footerText: "old", themeColors: {} })),
			{ status: 402, body: { message: "Custom domains are not part of your plan" } },
		]);
		expect(
			await other.monitoring.ensureStatusPage({ ...INPUT, footer: "new" }).catch((e: unknown) => e)
		).toMatchObject({ status: 402 });
		const none = capability([list(page({ footerText: "old" })), CSS_402]);
		expect(
			await none.monitoring.ensureStatusPage({ ...INPUT, footer: "new" }).catch((e: unknown) => e)
		).toMatchObject({ status: 402 });
		expect(other.stub.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
		expect(none.stub.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
	});

	it("brings a page, a component's place and a rule in line without dropping what they hold", async () => {
		const { monitoring, stub } = capability([
			list(page({ isPrivate: true, logo: "https://example.com/l.png", url: "old" })),
			{ status: 200, body: page() }, // PUT
			list(
				component("g1", "Services", { type: "GROUP", displayOrder: 0 }),
				component("s1", "Sentinel", { parentId: null, displayOrder: 5 }),
				component("s2", "Comlink", { parentId: "g1", displayOrder: 1 }),
				component("s3", "Docs", { displayOrder: 1 }),
				component("x1", "Hand made")
			),
			{ body: component("s1", "Sentinel") }, // PUT component
			list(
				rule("r1", "Sentinel", ["other"], "s1", {
					components: [{ id: "k", componentId: "s9", targetImpact: "PARTIAL_OUTAGE" }],
					firstUpdate: "my text",
				}),
				rule("r2", "Comlink", ["comlink"], "s2"),
				rule("r3", "Docs", ["docs"], "s3", {
					components: [{ id: "k", componentId: "s3", targetImpact: "DEGRADED_PERFORMANCE" }],
				}),
				rule("r9", "Hand made rule", ["x"], "x1")
			),
			{ body: {} }, // PUT rule Sentinel
			{ body: {} }, // PUT rule Docs
			active,
		]);
		const result = await monitoring.ensureStatusPage({ ...INPUT, private: false });

		expect(result.updated).toEqual(["slug", "isPrivate"]);
		expect(result.components).toEqual({ created: [], updated: ["Sentinel"] });
		expect(result.rules).toEqual({ created: [], updated: ["Sentinel", "Docs"] });
		const puts = stub.calls.filter((c) => c.method === "PUT");
		// The page keeps its logo: a PUT replaces, so what the config does not state goes back as it was.
		expect(puts[0]?.body).toMatchObject({
			url: "theholocron",
			isPrivate: false,
			logo: "https://example.com/l.png",
		});
		expect(puts[0]?.body).not.toHaveProperty("id");
		expect(puts[1]?.body).toMatchObject({ name: "Sentinel", parentId: "g1", displayOrder: 0 });
		expect(puts[2]?.body).toMatchObject({
			firstUpdate: "my text",
			tags: ["other", "sentinel"],
			components: [
				{ componentId: "s9", targetImpact: "PARTIAL_OUTAGE" },
				{ componentId: "s1", targetImpact: "MAJOR_OUTAGE" },
			],
		});
		expect(stub.calls.some((c) => c.method === "DELETE")).toBe(false);
	});

	it("moves a group that sits in the wrong place and reports it as brought in line", async () => {
		const wrong = list(
			component("g1", "Services", { type: "GROUP", displayOrder: 5 }),
			component("s1", "Sentinel", { parentId: "g1", displayOrder: 0 }),
			component("s2", "Comlink", { parentId: "g1", displayOrder: 1 }),
			component("s3", "Docs", { displayOrder: 1 })
		);
		const moved = { body: component("g1", "Services", { type: "GROUP", displayOrder: 0 }) };
		const { monitoring, stub } = capability([list(page()), wrong, moved, goodRules(), active]);
		const result = await monitoring.ensureStatusPage(INPUT);
		expect(result.components).toEqual({ created: [], updated: ["Services"] });
		expect(stub.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
	});

	it("leaves a page's privacy alone when the config does not state it, and makes a page with no domain", async () => {
		const bare = { name: "P", slug: "p", components: [] };
		const stub = stubFetch([
			list(page({ name: "P", url: "p", isPrivate: true, customDomain: null })),
			list(),
			list(),
		]);
		const client = createChecklyClient({ token: "t", accountId: "acct", fetch: stub.fetch });
		const result = await new ChecklyMonitoring(() => client).ensureStatusPage(bare);
		expect(result.domain).toBeUndefined();
		expect(stub.calls.every((c) => c.method === "GET")).toBe(true);
	});

	it("neither reads nor makes a rule when automation is off, since the plan refuses them", async () => {
		const off = { ...INPUT, domain: undefined, automation: false };
		const { monitoring, stub } = capability([list(page({ customDomain: null })), goodComponents()]);
		const result = await monitoring.ensureStatusPage(off);
		expect(result).toMatchObject({ created: false, components: { created: [], updated: [] } });
		expect(result.rules).toEqual({ created: [], updated: [] });
		expect(stub.calls).toHaveLength(2);
		expect(stub.calls.some((c) => String(c.url).includes("automation-rules"))).toBe(false);
	});
});

describe("inspectStatusPage", () => {
	it("says the page is missing", async () => {
		const { monitoring } = capability([list()]);
		expect(await monitoring.inspectStatusPage(INPUT)).toMatchObject({ exists: false, missingComponents: [] });
	});

	it("passes a page that matches, public and verified", async () => {
		const { monitoring } = capability([list(page()), goodComponents(), goodRules(), active]);
		expect(await monitoring.inspectStatusPage(INPUT)).toEqual({
			exists: true,
			public: true,
			domain: "status.theholocron.dev",
			domainVerified: true,
			domainProblems: [],
			missingComponents: [],
			misplacedComponents: [],
			missingRules: [],
			extraComponents: [],
			extraRules: [],
		});
	});

	it("reports a private page, gaps, extras and the record still to make", async () => {
		const { monitoring } = capability([
			list(page({ isPrivate: true })),
			list(
				component("g1", "Services", { type: "GROUP", displayOrder: 3 }),
				component("s1", "Sentinel", { parentId: null, displayOrder: 0 }),
				component("s3", "Docs", { displayOrder: 1 }),
				component("x1", "Hand made")
			),
			list(rule("r1", "Sentinel", ["wrong"], "s1"), rule("r9", "Hand rule", ["x"], "x1")),
			{
				body: {
					status: "pending",
					sslStatus: "pending",
					CNAME: "t.example.net",
					verificationErrors: ["no record found"],
				},
			},
		]);
		const state = await monitoring.inspectStatusPage(INPUT);
		expect(state.public).toBe(false);
		expect(state.missingComponents).toEqual(["Comlink"]);
		expect(state.misplacedComponents).toEqual(["Services: order 3", "Sentinel: not under group Services"]);
		expect(state.missingRules).toEqual(["Sentinel", "Comlink", "Docs"]);
		expect(state.extraComponents).toEqual(["Hand made"]);
		expect(state.extraRules).toEqual(["Hand rule"]);
		expect(state.domainVerified).toBe(false);
		expect(state.domainRecord).toEqual({ type: "CNAME", name: "status.theholocron.dev", value: "t.example.net" });
		expect(state.domainProblems).toEqual(["no record found"]);
	});

	it("says when the page serves another domain", async () => {
		const { monitoring } = capability([list(page({ customDomain: null })), goodComponents(), goodRules()]);
		const state = await monitoring.inspectStatusPage(INPUT);
		expect(state.domainProblems).toEqual(["serves no custom domain, declared status.theholocron.dev"]);
		expect(state.domainVerified).toBeUndefined();
	});

	it("reports a missing group, a service outside it and one in the wrong place", async () => {
		const flat = list(
			component("s1", "Sentinel", { displayOrder: 0 }),
			component("s2", "Comlink", { displayOrder: 1 }),
			component("s3", "Docs", { displayOrder: 4 })
		);
		const { monitoring } = capability([list(page()), flat, goodRules(), active]);
		const state = await monitoring.inspectStatusPage(INPUT);
		expect(state.missingComponents).toEqual(["Services"]);
		expect(state.misplacedComponents).toEqual([
			"Sentinel: not under group Services",
			"Comlink: not under group Services",
			"Docs: order 4, expected 1",
		]);
	});

	it("says nothing of a domain the config does not declare, and gives no record when the provider names none", async () => {
		const bare = capability([list(page({ customDomain: null })), goodComponents(), goodRules()]);
		const noDomain = await bare.monitoring.inspectStatusPage({ ...INPUT, domain: undefined });
		expect(noDomain.domain).toBeUndefined();
		expect(noDomain.domainVerified).toBeUndefined();
		const pending = capability([
			list(page()),
			goodComponents(),
			goodRules(),
			{ body: { status: "pending", sslStatus: "pending" } },
		]);
		const state = await pending.monitoring.inspectStatusPage(INPUT);
		expect(state).toMatchObject({ domainVerified: false, domainProblems: [] });
		expect(state.domainRecord).toBeUndefined();
	});

	it("does not read or compare rules when automation is off, even for a missing component", async () => {
		const off = { ...INPUT, domain: undefined, automation: false };
		const { monitoring, stub } = capability([
			list(page({ customDomain: null })),
			list(
				component("g1", "Services", { type: "GROUP", displayOrder: 0 }),
				component("s1", "Sentinel", { parentId: "g1", displayOrder: 0 }),
				component("s2", "Comlink", { parentId: "g1", displayOrder: 1 })
			),
		]);
		const state = await monitoring.inspectStatusPage(off);
		expect(state).toMatchObject({ missingComponents: ["Docs"], missingRules: [], extraRules: [] });
		expect(stub.calls.some((c) => String(c.url).includes("automation-rules"))).toBe(false);
	});
});
