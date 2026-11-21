import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { REPO, stubFetch, TOKEN } from "../test-helpers.js";

const hook = (id: number) => ({ id, active: true, events: ["push"], config: { url: `https://x/${id}` } });

describe("hooks", () => {
	it("lists a repository's webhooks and an organization's from their own paths", async () => {
		const { fetch, calls } = stubFetch([{ body: [hook(1)] }, { body: [] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		expect(await client.hooks.listHooks({ kind: "repo", repo: REPO })).toEqual([hook(1)]);
		await client.hooks.listHooks({ kind: "organization", org: "theholocron" });
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/hooks");
		expect(calls[0]?.url).toContain("per_page=100");
		expect(calls[1]?.url).toContain("/orgs/theholocron/hooks");
	});

	it("reads every page, 100 at a time", async () => {
		const full = Array.from({ length: 100 }, (_, i) => hook(i));
		const { fetch, calls } = stubFetch([{ body: full }, { body: [hook(100)] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		expect(await client.hooks.listHooks({ kind: "repo", repo: REPO })).toHaveLength(101);
		expect(calls[1]?.url).toContain("page=2");
	});

	it("refuses to read past its page guard", async () => {
		const full = Array.from({ length: 100 }, (_, i) => hook(i));
		const { fetch } = stubFetch(Array.from({ length: 50 }, () => ({ body: full })));
		const client = createGitHubClient({ token: TOKEN, fetch });
		const err = await client.hooks.listHooks({ kind: "repo", repo: REPO }).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/refusing to read them all/);
	});

	it("refuses a repository that is not owner/name", async () => {
		const { fetch, calls } = stubFetch([]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const err = await client.hooks.listHooks({ kind: "repo", repo: "just-a-name" }).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/invalid repository/);
		expect(calls).toHaveLength(0);
	});

	it("makes a JSON webhook with the secret in its config", async () => {
		const { fetch, calls } = stubFetch([{ body: hook(7) }, { body: hook(8) }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.hooks.createHook(
			{ kind: "repo", repo: REPO },
			{ url: "https://c/dependabot", secret: "s3", events: ["dependabot_alert"] }
		);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toEqual({
			name: "web",
			active: true,
			events: ["dependabot_alert"],
			config: { url: "https://c/dependabot", content_type: "json", secret: "s3", insecure_ssl: "0" },
		});
		await client.hooks.createHook(
			{ kind: "organization", org: "theholocron" },
			{ url: "https://c/d", secret: "s3", events: ["push"], active: false }
		);
		expect(calls[1]?.body).toMatchObject({ active: false });
	});

	it("patches only the fields given and never sends the config", async () => {
		const { fetch, calls } = stubFetch([{ body: hook(7) }, { body: hook(7) }, { body: hook(7) }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.hooks.updateHook({ kind: "repo", repo: REPO }, 7, { events: ["a"], active: true });
		await client.hooks.updateHook({ kind: "repo", repo: REPO }, 7, { events: ["a"] });
		await client.hooks.updateHook({ kind: "repo", repo: REPO }, 7, { active: false });
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/hooks/7");
		expect(calls[0]?.body).toEqual({ events: ["a"], active: true });
		expect(calls[1]?.body).toEqual({ events: ["a"] });
		expect(calls[2]?.body).toEqual({ active: false });
	});
});
