import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createVercelClient } from "../rest.js";
import { VercelDeployment } from "./deployment.js";

const URL_ = "https://comlink.example/vercel";
const input = { source: "vercel", url: URL_, name: "Vercel", events: ["deployment.error"], scope: ["prj_1"] };

function make(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const client = createVercelClient({ token: "pat", teamId: "team_1", fetch });
	return { deployment: new VercelDeployment(() => client), calls };
}

describe("VercelDeployment.ensureRelaySource", () => {
	it("makes the webhook when none has the URL and returns the secret", async () => {
		const { deployment, calls } = make([
			{ body: [{ id: "h0", url: "https://other.example", events: [] }] },
			{ body: { id: "h1", url: URL_, events: ["deployment.error"], secret: "made-secret" } },
		]);
		const out = await deployment.ensureRelaySource(input);
		expect(out).toEqual({ created: true, updated: [], secret: "made-secret" });
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toContain("teamId=team_1");
		expect(calls[1]?.body).toEqual({ url: URL_, events: ["deployment.error"], projectIds: ["prj_1"] });
	});

	it("leaves project ids out when no scope is given", async () => {
		const { deployment, calls } = make([
			{ body: [] },
			{ body: { id: "h", url: URL_, events: ["x"], secret: "s" } },
		]);
		await deployment.ensureRelaySource({ ...input, scope: undefined });
		expect(calls[1]?.body).toEqual({ url: URL_, events: ["deployment.error"] });
	});

	it("adopts a webhook found by URL, writes nothing and returns no secret", async () => {
		const { deployment, calls } = make([{ body: [{ id: "h1", url: URL_, events: ["deployment.created"] }] }]);
		const out = await deployment.ensureRelaySource(input);
		expect(out).toEqual({ created: false, updated: [] });
		expect(calls).toHaveLength(1);
	});

	it("is a todo, with no write, when no event is declared", async () => {
		const { deployment, calls } = make([{ body: [] }]);
		const out = await deployment.ensureRelaySource({ ...input, events: undefined });
		expect(out.created).toBe(false);
		expect(out.todo?.[0]).toMatch(/at least one event/);
		expect(calls).toHaveLength(1);
	});

	it("is a todo when the plan or token is refused", async () => {
		const { deployment } = make([{ body: [] }, { status: 403, body: { error: { code: "forbidden" } } }]);
		const out = await deployment.ensureRelaySource(input);
		expect(out.todo?.[0]).toMatch(/Pro or Enterprise/);
		expect(out.secret).toBeUndefined();
	});

	it("lets any other failure through", async () => {
		const { deployment } = make([{ body: [] }, { status: 500, body: {} }]);
		await expect(deployment.ensureRelaySource(input)).rejects.toThrow();
	});
});

describe("VercelDeployment.inspectRelaySource", () => {
	it("reports a missing webhook", async () => {
		const { deployment } = make([{ body: [] }]);
		expect(await deployment.inspectRelaySource(input)).toEqual({ exists: false });
	});

	it("reports events and projects of the one with the URL, never a secret", async () => {
		const { deployment } = make([
			{ body: [{ id: "h1", url: URL_, events: ["deployment.error"], projectIds: ["prj_1"] }] },
		]);
		const state = await deployment.inspectRelaySource(input);
		expect(state).toEqual({ exists: true, events: ["deployment.error"], scope: ["prj_1"] });
	});

	it("reports no projects as an empty scope", async () => {
		const { deployment } = make([{ body: [{ id: "h1", url: URL_, events: [] }] }]);
		expect((await deployment.inspectRelaySource(input)).scope).toEqual([]);
	});
});
