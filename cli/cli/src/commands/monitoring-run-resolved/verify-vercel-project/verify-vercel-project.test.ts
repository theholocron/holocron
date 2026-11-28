import { describe, expect, it } from "vitest";

import { verifyVercelDeploymentProject } from "./verify-vercel-project.js";

function fakeFetch(status: number, body: unknown): typeof fetch {
	return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("verifyVercelDeploymentProject", () => {
	it("returns true when the deployment's projectId matches exactly", async () => {
		const result = await verifyVercelDeploymentProject(
			"https://sentinel-abc123.vercel.app",
			"prj_sentinel",
			"token",
			{ fetch: fakeFetch(200, { projectId: "prj_sentinel" }) }
		);
		expect(result).toBe(true);
	});

	it("returns false when the deployment belongs to a different project", async () => {
		const result = await verifyVercelDeploymentProject(
			"https://evil-attacker-project.vercel.app",
			"prj_sentinel",
			"token",
			{ fetch: fakeFetch(200, { projectId: "prj_attacker" }) }
		);
		expect(result).toBe(false);
	});

	it("returns false on a non-2xx response, never throws", async () => {
		const result = await verifyVercelDeploymentProject("https://x.vercel.app", "prj_sentinel", "token", {
			fetch: fakeFetch(404, { error: "not found" }),
		});
		expect(result).toBe(false);
	});

	it("returns false when the response body has no projectId at all", async () => {
		const result = await verifyVercelDeploymentProject("https://x.vercel.app", "prj_sentinel", "token", {
			fetch: fakeFetch(200, { somethingElse: true }),
		});
		expect(result).toBe(false);
	});

	it("returns false, not throws, when the request itself fails (network error)", async () => {
		const fetchSpy = (async () => {
			throw new Error("network down");
		}) as unknown as typeof fetch;
		const result = await verifyVercelDeploymentProject("https://x.vercel.app", "prj_sentinel", "token", {
			fetch: fetchSpy,
		});
		expect(result).toBe(false);
	});

	it("returns false, not throws, when the response body isn't valid JSON", async () => {
		const fetchSpy = (async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
		const result = await verifyVercelDeploymentProject("https://x.vercel.app", "prj_sentinel", "token", {
			fetch: fetchSpy,
		});
		expect(result).toBe(false);
	});

	it("returns false for an unparseable url, never throws", async () => {
		const result = await verifyVercelDeploymentProject("not a url", "prj_sentinel", "token", {
			fetch: fakeFetch(200, { projectId: "prj_sentinel" }),
		});
		expect(result).toBe(false);
	});

	it("sends only the hostname as the url query param, and the token as a bearer header", async () => {
		let requestedUrl = "";
		let requestedAuth: string | null = null;
		const fetchSpy = (async (reqUrl: string | URL, init?: { headers?: Record<string, string> }) => {
			requestedUrl = String(reqUrl);
			requestedAuth = init?.headers?.["Authorization"] ?? null;
			return new Response(JSON.stringify({ projectId: "prj_sentinel" }), { status: 200 });
		}) as unknown as typeof fetch;

		await verifyVercelDeploymentProject(
			"https://sentinel-abc123.vercel.app/some/path?x=1",
			"prj_sentinel",
			"tok123",
			{
				fetch: fetchSpy,
			}
		);

		expect(requestedUrl).toContain("url=sentinel-abc123.vercel.app");
		expect(requestedUrl).not.toContain("/some/path");
		expect(requestedAuth).toBe("Bearer tok123");
	});

	it("appends teamId when given", async () => {
		let requestedUrl = "";
		const fetchSpy = (async (reqUrl: string | URL) => {
			requestedUrl = String(reqUrl);
			return new Response(JSON.stringify({ projectId: "prj_sentinel" }), { status: 200 });
		}) as unknown as typeof fetch;

		await verifyVercelDeploymentProject("https://x.vercel.app", "prj_sentinel", "token", {
			fetch: fetchSpy,
			teamId: "team_abc",
		});

		expect(requestedUrl).toContain("teamId=team_abc");
	});

	it("omits teamId entirely when not given", async () => {
		let requestedUrl = "";
		const fetchSpy = (async (reqUrl: string | URL) => {
			requestedUrl = String(reqUrl);
			return new Response(JSON.stringify({ projectId: "prj_sentinel" }), { status: 200 });
		}) as unknown as typeof fetch;

		await verifyVercelDeploymentProject("https://x.vercel.app", "prj_sentinel", "token", { fetch: fetchSpy });

		expect(requestedUrl).not.toContain("teamId");
	});
});
