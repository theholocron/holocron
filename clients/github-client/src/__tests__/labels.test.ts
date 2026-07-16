import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN, REPO } from "./helpers.js";

const RAW_LABELS = [
	{ name: "bug", color: "d73a4a", description: "Something isn't working" },
	{ name: "enhancement", color: "a2eeef", description: null },
];

describe("labels", () => {
	it("GET /repos/{owner}/{name}/labels?per_page=100", async () => {
		const { fetch, calls } = stubFetch([{ body: RAW_LABELS }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.labels.listLabels(REPO);
		expect(calls[0]?.url).toContain(
			"/repos/theholocron/test-repo/labels?per_page=100",
		);
		expect(calls[0]?.method).toBe("GET");
		expect(result).toEqual(RAW_LABELS);
	});

	it("POST /repos/{owner}/{name}/labels", async () => {
		const body = {
			name: "chore",
			color: "ededed",
			description: "Maintenance",
		};
		const { fetch, calls } = stubFetch([{ body }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.labels.createLabel(REPO, body);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/labels");
		expect(calls[0]?.body).toMatchObject(body);
	});

	it("PATCH /repos/{owner}/{name}/labels/{name}", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { name: "bug", color: "ff0000", description: null } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.labels.updateLabel(REPO, "bug", { color: "ff0000" });
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain("/labels/bug");
	});

	it("DELETE /repos/{owner}/{name}/labels/{name}", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.labels.deleteLabel(REPO, "stale-label");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain("/labels/stale-label");
	});
});
