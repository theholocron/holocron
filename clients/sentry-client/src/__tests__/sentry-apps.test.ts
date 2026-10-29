import { describe, expect, it } from "vitest";

import { createSentryClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://sentry.test/api/0";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return {
		sentryApps: createSentryClient({ token: "tok", baseUrl: BASE, fetch }).sentryApps,
		calls,
	};
}

const app = {
	name: "Comlink",
	slug: "comlink-1",
	uuid: "u",
	status: "internal",
	scopes: ["event:read"],
	webhookUrl: "https://comlink.test/sentry",
	isAlertable: true,
};

describe("sentryApps", () => {
	it("lists an organization's custom integrations", async () => {
		const { sentryApps, calls } = client([{ body: [app] }]);
		expect(await sentryApps.list("org")).toEqual([app]);
		expect(calls[0]?.url).toBe(`${BASE}/organizations/org/sentry-apps/`);
	});

	it("gets one by slug", async () => {
		const { sentryApps, calls } = client([{ body: app }]);
		expect((await sentryApps.get("comlink-1")).slug).toBe("comlink-1");
		expect(calls[0]?.url).toBe(`${BASE}/sentry-apps/comlink-1/`);
	});

	it("creates an internal, alertable integration with its scopes and webhook", async () => {
		const { sentryApps, calls } = client([{ status: 201, body: app }]);
		await sentryApps.create("org", {
			name: "Comlink",
			scopes: ["event:read"],
			isAlertable: true,
			webhookUrl: "https://comlink.test/sentry",
		});
		expect(calls[0]).toMatchObject({
			method: "POST",
			url: `${BASE}/sentry-apps/`,
		});
		expect(calls[0]?.body).toMatchObject({
			name: "Comlink",
			organization: "org",
			scopes: ["event:read"],
			isInternal: true,
			isAlertable: true,
			webhookUrl: "https://comlink.test/sentry",
		});
	});

	it("creates one that is not alertable and has no webhook by default", async () => {
		const { sentryApps, calls } = client([{ status: 201, body: app }]);
		await sentryApps.create("org", { name: "Plain", scopes: [] });
		expect(calls[0]?.body).toMatchObject({
			isAlertable: false,
			webhookUrl: null,
			scopes: [],
		});
	});

	it("updates with every setting, reading the current ones only for those not given", async () => {
		const { sentryApps, calls } = client([{ body: app }, { body: app }, { body: app }]);
		await sentryApps.update("comlink-1", {
			name: "Comlink",
			scopes: ["event:read"],
			webhookUrl: "https://x/sentry",
			isAlertable: true,
		});
		await sentryApps.update("comlink-1", {
			name: "Comlink",
			scopes: ["event:read"],
		});
		expect(calls[0]).toMatchObject({
			method: "PUT",
			url: `${BASE}/sentry-apps/comlink-1/`,
		});
		expect(calls[0]?.body).toEqual({
			name: "Comlink",
			scopes: ["event:read"],
			isInternal: true,
			isAlertable: true,
			webhookUrl: "https://x/sentry",
		});
		expect(calls).toHaveLength(3);
		expect(calls[1]?.method).toBe("GET");
		expect(calls[2]?.body).toEqual({
			name: "Comlink",
			scopes: ["event:read"],
			isInternal: true,
			isAlertable: app.isAlertable,
			webhookUrl: app.webhookUrl,
		});
	});

	it("lists the installations, which carry the numeric app id", async () => {
		const inst = {
			uuid: "i",
			status: "installed",
			app: { uuid: "u", slug: "comlink-1", sentryAppId: 184160 },
		};
		const { sentryApps, calls } = client([{ body: [inst] }]);
		expect((await sentryApps.installations("org"))[0]?.app.sentryAppId).toBe(184160);
		expect(calls[0]?.url).toBe(`${BASE}/organizations/org/sentry-app-installations/`);
	});
});

describe("sentryApps.update fallbacks", () => {
	it("keeps the integration not alertable and without a webhook when the current one reports neither", async () => {
		const { sentryApps, calls } = client([{ body: { name: "Bare", slug: "bare", scopes: [] } }, { body: app }]);
		await sentryApps.update("bare", { name: "Bare", scopes: [] });
		expect(calls[1]?.body).toMatchObject({ isAlertable: false, webhookUrl: null });
	});
});
