import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { REPO, stubFetch, TOKEN } from "./helpers.js";

const PAGES_URL = `/repos/theholocron/test-repo/pages`;

describe("pages", () => {
	describe("getPages", () => {
		it("GET /repos/{owner}/{name}/pages returns Pages data", async () => {
			const { fetch, calls } = stubFetch([
				{
					body: {
						status: "built",
						build_type: "workflow",
						https_enforced: true,
						custom_domain: "docs.theholocron.dev",
					},
				},
			]);
			const client = createGitHubClient({ token: TOKEN, fetch });
			const result = await client.pages.getPages(REPO);
			expect(calls[0]?.url).toContain(PAGES_URL);
			expect(calls[0]?.method).toBe("GET");
			expect(result?.build_type).toBe("workflow");
			expect(result?.custom_domain).toBe("docs.theholocron.dev");
			expect(result?.https_enforced).toBe(true);
		});

		it("GET /repos/{owner}/{name}/pages returns null when Pages is not enabled (404)", async () => {
			const { fetch } = stubFetch([
				{ status: 404, body: { message: "Not Found" } },
			]);
			const client = createGitHubClient({ token: TOKEN, fetch });
			const result = await client.pages.getPages(REPO);
			expect(result).toBeNull();
		});

		it("GET /repos/{owner}/{name}/pages re-throws non-404 errors", async () => {
			const { fetch } = stubFetch([
				{ status: 403, body: { message: "Forbidden" } },
			]);
			const client = createGitHubClient({ token: TOKEN, fetch });
			await expect(client.pages.getPages(REPO)).rejects.toThrow();
		});
	});

	describe("createPages", () => {
		it("POST /repos/{owner}/{name}/pages with workflow build type", async () => {
			const { fetch, calls } = stubFetch([
				{
					status: 201,
					body: {
						status: "building",
						build_type: "workflow",
						https_enforced: false,
						custom_domain: null,
					},
				},
			]);
			const client = createGitHubClient({ token: TOKEN, fetch });
			const result = await client.pages.createPages(REPO, {
				build_type: "workflow",
			});
			expect(calls[0]?.url).toContain(PAGES_URL);
			expect(calls[0]?.method).toBe("POST");
			expect(calls[0]?.body).toMatchObject({ build_type: "workflow" });
			expect(result.build_type).toBe("workflow");
		});

		it("POST /repos/{owner}/{name}/pages with legacy build type and branch source", async () => {
			const { fetch, calls } = stubFetch([
				{
					status: 201,
					body: {
						status: "building",
						build_type: "legacy",
						https_enforced: false,
						custom_domain: null,
					},
				},
			]);
			const client = createGitHubClient({ token: TOKEN, fetch });
			await client.pages.createPages(REPO, {
				build_type: "legacy",
				source: { branch: "gh-pages", path: "/" },
			});
			expect(calls[0]?.method).toBe("POST");
			expect(calls[0]?.body).toMatchObject({
				build_type: "legacy",
				source: { branch: "gh-pages", path: "/" },
			});
		});
	});

	describe("updatePages", () => {
		it("PUT /repos/{owner}/{name}/pages updates build type", async () => {
			const { fetch, calls } = stubFetch([{ status: 204 }]);
			const client = createGitHubClient({ token: TOKEN, fetch });
			await client.pages.updatePages(REPO, { build_type: "workflow" });
			expect(calls[0]?.url).toContain(PAGES_URL);
			expect(calls[0]?.method).toBe("PUT");
			expect(calls[0]?.body).toMatchObject({ build_type: "workflow" });
		});

		it("PUT /repos/{owner}/{name}/pages updates cname and https", async () => {
			const { fetch, calls } = stubFetch([{ status: 204 }]);
			const client = createGitHubClient({ token: TOKEN, fetch });
			await client.pages.updatePages(REPO, {
				build_type: "workflow",
				cname: "docs.theholocron.dev",
				https_enforced: true,
			});
			expect(calls[0]?.body).toMatchObject({
				cname: "docs.theholocron.dev",
				https_enforced: true,
			});
		});

		it("PUT /repos/{owner}/{name}/pages can clear cname", async () => {
			const { fetch, calls } = stubFetch([{ status: 204 }]);
			const client = createGitHubClient({ token: TOKEN, fetch });
			await client.pages.updatePages(REPO, { cname: null });
			expect(calls[0]?.body).toMatchObject({ cname: null });
		});
	});
});
