import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { DEFAULT_RELAY_EVENTS, ensureRelaySource, inspectRelaySource, relayTarget } from "./relay-source.js";

const URL_ = "https://comlink.example/dependabot";
const REPO = "acme/widgets";
const input = { source: "dependabot", url: URL_, name: "Dependabot", secret: "chosen" };

function make(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "t", fetch }), calls };
}

const hook = (over: Record<string, unknown> = {}) => ({
	id: 9,
	active: true,
	events: ["dependabot_alert"],
	config: { url: URL_, content_type: "json" },
	...over,
});

describe("relayTarget", () => {
	it("defaults to the plugin's repository", () => {
		expect(relayTarget(input, REPO)).toEqual({ scope: { kind: "repo", repo: REPO }, label: `repository ${REPO}` });
	});

	it("takes one named repository", () => {
		expect(relayTarget({ ...input, scope: ["a/b"] }, REPO)).toMatchObject({ scope: { kind: "repo", repo: "a/b" } });
	});

	it("takes an organization from options.org", () => {
		expect(relayTarget({ ...input, options: { org: "acme" } }, REPO)).toMatchObject({
			scope: { kind: "organization", org: "acme" },
		});
	});

	it("refuses a repository and an organization together", () => {
		expect(relayTarget({ ...input, scope: ["a/b"], options: { org: "acme" } }, REPO)).toMatchObject({
			problem: expect.stringMatching(/not both/),
		});
		// An empty scope with an org is the org alone.
		expect(relayTarget({ ...input, scope: [], options: { org: "acme" } }, REPO)).toHaveProperty("scope");
	});

	it("refuses an organization that is not a login", () => {
		expect(relayTarget({ ...input, options: { org: "not a login" } }, REPO)).toMatchObject({
			problem: expect.stringMatching(/organization login/),
		});
		expect(relayTarget({ ...input, options: { org: 3 } }, REPO)).toHaveProperty("problem");
	});

	it("refuses more than one repository", () => {
		expect(relayTarget({ ...input, scope: ["a/b", "c/d"] }, REPO)).toMatchObject({
			problem: expect.stringMatching(/one repository, not 2/),
		});
	});

	it("refuses a scope that is not owner/name, and a default that is not either", () => {
		expect(relayTarget({ ...input, scope: ["nope"] }, REPO)).toMatchObject({
			problem: expect.stringMatching(/owner\/name`$/),
		});
		expect(relayTarget(input, "")).toMatchObject({ problem: expect.stringMatching(/no repository to default to/) });
	});
});

describe("ensureRelaySource", () => {
	it("makes the webhook when none has the URL and returns the secret it set", async () => {
		const { client, calls } = make([{ body: [hook({ config: { url: "https://other" } })] }, { body: hook() }]);
		const out = await ensureRelaySource(client, REPO, input);
		expect(out).toEqual({ created: true, updated: [], secret: "chosen" });
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toContain("/repos/acme/widgets/hooks");
		expect(calls[1]?.body).toMatchObject({
			events: DEFAULT_RELAY_EVENTS,
			active: true,
			config: { url: URL_, content_type: "json", secret: "chosen" },
		});
	});

	it("makes an organization webhook with the declared events", async () => {
		const { client, calls } = make([{ body: [] }, { body: hook() }]);
		await ensureRelaySource(client, REPO, { ...input, events: ["push"], options: { org: "acme" } });
		expect(calls[1]?.url).toContain("/orgs/acme/hooks");
		expect(calls[1]?.body).toMatchObject({ events: ["push"] });
	});

	it("makes nothing, and says so, when no secret is offered", async () => {
		const { client, calls } = make([{ body: [] }]);
		const out = await ensureRelaySource(client, REPO, { ...input, secret: undefined });
		expect(out.created).toBe(false);
		expect(out.todo?.[0]).toMatch(/no signing secret/);
		expect(calls).toHaveLength(1);
	});

	it("adopts a webhook that is right: no write, no secret", async () => {
		const { client, calls } = make([{ body: [hook({ events: ["dependabot_alert"] })] }]);
		expect(await ensureRelaySource(client, REPO, input)).toEqual({ created: false, updated: [] });
		expect(calls).toHaveLength(1);
	});

	it("brings events and the active flag in line, sending neither config nor secret", async () => {
		const { client, calls } = make([{ body: [hook({ events: ["push"], active: false })] }, { body: hook() }]);
		const out = await ensureRelaySource(client, REPO, input);
		expect(out).toEqual({ created: false, updated: ["events", "active"] });
		expect(calls[1]?.method).toBe("PATCH");
		expect(calls[1]?.url).toContain("/hooks/9");
		expect(calls[1]?.body).toEqual({ events: DEFAULT_RELAY_EVENTS, active: true });
	});

	it("changes only the flag that differs", async () => {
		const { client, calls } = make([{ body: [hook({ active: false })] }, { body: hook() }]);
		expect(await ensureRelaySource(client, REPO, input)).toEqual({ created: false, updated: ["active"] });
		expect(calls[1]?.body).toEqual({ active: true });
	});

	it("compares events without regard to order", async () => {
		const { client, calls } = make([{ body: [hook({ events: ["b", "a"] })] }]);
		expect(await ensureRelaySource(client, REPO, { ...input, events: ["a", "b"] })).toEqual({
			created: false,
			updated: [],
		});
		expect(calls).toHaveLength(1);
	});

	it("reports a scope problem as a todo and calls nothing", async () => {
		const { client, calls } = make([]);
		const out = await ensureRelaySource(client, REPO, { ...input, scope: ["a/b", "c/d"] });
		expect(out.todo?.[0]).toMatch(/one repository/);
		expect(calls).toHaveLength(0);
	});

	it("turns a 403 or a 404 into a todo naming the permission, per scope", async () => {
		const repo = make([{ status: 404, body: { message: "Not Found" } }]);
		expect((await ensureRelaySource(repo.client, REPO, input)).todo?.[0]).toMatch(/Repository permission Webhooks/);
		const org = make([{ status: 403, body: { message: "Forbidden" } }]);
		expect((await ensureRelaySource(org.client, REPO, { ...input, options: { org: "acme" } })).todo?.[0]).toMatch(
			/Organization permission Webhooks/
		);
	});

	it("lets any other failure through", async () => {
		const { client } = make([{ status: 500, body: {} }]);
		await expect(ensureRelaySource(client, REPO, input)).rejects.toThrow();
	});
});

describe("inspectRelaySource", () => {
	it("reports a missing webhook", async () => {
		const { client } = make([{ body: [] }]);
		expect(await inspectRelaySource(client, REPO, input)).toEqual({ exists: false });
	});

	it("reports a repository webhook's state and covered repository, never a secret", async () => {
		const { client } = make([{ body: [hook({ active: false })] }]);
		expect(await inspectRelaySource(client, REPO, input)).toEqual({
			exists: true,
			enabled: false,
			events: ["dependabot_alert"],
			scope: [REPO],
		});
	});

	it("reports an organization webhook with no scope", async () => {
		const { client } = make([{ body: [hook()] }]);
		const state = await inspectRelaySource(client, REPO, { ...input, options: { org: "acme" } });
		expect(state).toEqual({ exists: true, enabled: true, events: ["dependabot_alert"] });
	});

	it("throws a scope problem", async () => {
		const { client } = make([]);
		await expect(inspectRelaySource(client, REPO, { ...input, scope: ["x"] })).rejects.toThrow(/owner\/name/);
	});
});
