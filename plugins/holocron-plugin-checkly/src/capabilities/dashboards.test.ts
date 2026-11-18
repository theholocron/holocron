import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createChecklyClient } from "../rest.js";
import { ChecklyMonitoring } from "./monitoring.js";

function makeCapability(responses: Array<{ status?: number; body?: unknown }>) {
	const stub = stubFetch(responses);
	const client = createChecklyClient({ token: "t", accountId: "acct-1", fetch: stub.fetch });
	const capability = new ChecklyMonitoring(() => client, {
		dashboards: [{ name: "The Holocron", tags: ["sentinel"] }],
	});
	return { capability, stub };
}

const KEY = "raw-view-key-value";

const dash = (over: Record<string, unknown> = {}) => ({
	id: 1,
	dashboardId: "d-1",
	header: "The Holocron",
	tags: ["sentinel", "docs"],
	isPrivate: true,
	keys: [],
	created_at: "2026-01-01T00:00:00.000Z",
	...over,
});

const withKey = { keys: [{ id: "k1", rawKey: KEY, maskedKey: "raw-***", created_at: "2026-01-01T00:00:00.000Z" }] };
const input = { name: "The Holocron", tags: ["sentinel", "docs"] };

describe("ChecklyMonitoring dashboards", () => {
	it("exposes the dashboards it was configured with, none by default", () => {
		expect(makeCapability([]).capability.dashboards).toHaveLength(1);
		const bare = new ChecklyMonitoring(() => createChecklyClient({ token: "t", accountId: "a" }));
		expect(bare.dashboards).toEqual([]);
	});

	describe("ensureDashboard", () => {
		it("creates a private dashboard when none has that header, and returns its key", async () => {
			const { capability, stub } = makeCapability([
				{ body: [dash({ header: "Other", dashboardId: "d-9" })] },
				{ status: 201, body: dash() },
				{ body: dash(withKey) },
			]);
			const result = await capability.ensureDashboard(input);
			expect(result).toEqual({ id: "d-1", created: true, key: KEY });
			expect(stub.calls[1]?.body).toEqual({
				header: "The Holocron",
				tags: ["sentinel", "docs"],
				isPrivate: true,
			});
		});

		it("takes the key from the create response without a second read", async () => {
			const { capability, stub } = makeCapability([{ body: [] }, { status: 201, body: dash(withKey) }]);
			expect((await capability.ensureDashboard(input)).key).toBe(KEY);
			expect(stub.calls).toHaveLength(2);
		});

		it("returns no key when the provider holds none", async () => {
			const { capability } = makeCapability([{ body: [] }, { status: 201, body: dash() }, { body: dash() }]);
			expect(await capability.ensureDashboard(input)).toEqual({ id: "d-1", created: true });
		});

		it("makes a public dashboard only when asked, sends the description and domain, and reads no key", async () => {
			const { capability, stub } = makeCapability([
				{ body: [] },
				{ status: 201, body: dash({ isPrivate: false }) },
			]);
			const result = await capability.ensureDashboard({
				...input,
				private: false,
				description: "What is up",
				domain: "status.example.com",
			});
			expect(result).toEqual({ id: "d-1", created: true });
			expect(stub.calls[1]?.body).toMatchObject({
				isPrivate: false,
				description: "What is up",
				customDomain: "status.example.com",
			});
			expect(stub.calls).toHaveLength(2);
		});

		it("changes nothing, and makes no write, when the dashboard is as declared (tags in any order)", async () => {
			const { capability, stub } = makeCapability([{ body: [dash({ tags: ["docs", "sentinel"] })] }]);
			expect(await capability.ensureDashboard(input)).toEqual({ id: "d-1", created: false });
			expect(stub.calls).toHaveLength(1);
		});

		it("updates only the tags that differ, leaving unstated fields alone, and returns no key", async () => {
			const { capability, stub } = makeCapability([
				{ body: [dash({ tags: ["sentinel"], description: "kept", ...withKey })] },
				{ body: dash() },
			]);
			const result = await capability.ensureDashboard(input);
			expect(result).toEqual({ id: "d-1", created: false, updated: ["tags"] });
			expect(stub.calls[1]).toMatchObject({ method: "PUT" });
			expect(stub.calls[1]?.body).toEqual({ tags: ["sentinel", "docs"] });
		});

		it("makes a public dashboard private and hands over the key it now has", async () => {
			const { capability, stub } = makeCapability([
				{ body: [dash({ isPrivate: false })] },
				{ body: dash() },
				{ body: dash(withKey) },
			]);
			const result = await capability.ensureDashboard(input);
			expect(result).toEqual({ id: "d-1", created: false, updated: ["private"], key: KEY });
			expect(stub.calls[1]?.body).toEqual({ isPrivate: true });
		});

		it("treats a dashboard that holds no tags as lacking every declared one", async () => {
			const { capability, stub } = makeCapability([{ body: [dash({ tags: undefined })] }, { body: dash() }]);
			const result = await capability.ensureDashboard(input);
			expect(result).toEqual({ id: "d-1", created: false, updated: ["tags"] });
			expect(stub.calls[1]?.body).toEqual({ tags: ["sentinel", "docs"] });
		});

		it("updates the description and the domain when they are stated and differ", async () => {
			const { capability, stub } = makeCapability([{ body: [dash()] }, { body: dash() }]);
			const result = await capability.ensureDashboard({
				...input,
				description: "new",
				domain: "status.example.com",
			});
			expect(result.updated).toEqual(["description", "domain"]);
			expect(stub.calls[1]?.body).toEqual({ description: "new", customDomain: "status.example.com" });
		});

		it("sends the logo, the favicon and the link on a new dashboard", async () => {
			const { capability, stub } = makeCapability([
				{ body: [] },
				{ status: 201, body: dash({ isPrivate: false }) },
			]);
			await capability.ensureDashboard({
				...input,
				private: false,
				logo: "https://example.com/l.webp",
				favicon: "https://example.com/f.svg",
				link: "https://example.com/",
			});
			expect(stub.calls[1]?.body).toMatchObject({
				logo: "https://example.com/l.webp",
				favicon: "https://example.com/f.svg",
				link: "https://example.com/",
			});
		});

		it("updates a logo, a favicon or a link that differs, counting an unset one as empty, and no other", async () => {
			const { capability, stub } = makeCapability([
				{ body: [dash({ logo: "https://example.com/l.webp", link: "" })] },
				{ body: dash() },
			]);
			const result = await capability.ensureDashboard({
				...input,
				logo: "https://example.com/l.webp",
				favicon: "https://example.com/f.svg",
				link: "https://example.com/",
			});
			expect(result.updated).toEqual(["favicon", "link"]);
			expect(stub.calls[1]?.body).toEqual({ favicon: "https://example.com/f.svg", link: "https://example.com/" });
		});

		it("never deletes", async () => {
			const { capability, stub } = makeCapability([{ body: [dash({ tags: [] })] }, { body: dash() }]);
			await capability.ensureDashboard(input);
			expect(stub.calls.map((c) => c.method)).not.toContain("DELETE");
		});
	});

	describe("inspectDashboard", () => {
		it("reports a missing dashboard and the account's others", async () => {
			const { capability } = makeCapability([{ body: [dash({ header: "Other" })] }]);
			expect(await capability.inspectDashboard("The Holocron")).toEqual({ exists: false, others: ["Other"] });
		});

		it("reports privacy, tags and domain, and never the key", async () => {
			const { capability } = makeCapability([
				{ body: [dash({ customDomain: "status.example.com", ...withKey }), dash({ header: "Other" })] },
			]);
			const state = await capability.inspectDashboard("The Holocron");
			expect(state).toEqual({
				exists: true,
				private: true,
				tags: ["sentinel", "docs"],
				domain: "status.example.com",
				others: ["Other"],
			});
			expect(JSON.stringify(state)).not.toContain(KEY);
		});

		it("names another dashboard that has no header by its id", async () => {
			const { capability } = makeCapability([
				{ body: [dash(), dash({ header: undefined, dashboardId: "d-7" })] },
			]);
			expect(await capability.inspectDashboard("The Holocron")).toMatchObject({ exists: true, others: ["d-7"] });
		});

		it("reads a dashboard with no privacy flag as public", async () => {
			const { capability } = makeCapability([{ body: [dash({ isPrivate: undefined, tags: undefined })] }]);
			expect(await capability.inspectDashboard("The Holocron")).toMatchObject({ private: false, tags: [] });
		});
	});
});
