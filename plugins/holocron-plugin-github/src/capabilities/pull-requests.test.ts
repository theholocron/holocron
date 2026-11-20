import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../rest.js";
import { createPullRequest, markReady, updatePullRequest, withLink } from "./pull-requests.js";

const REPO = "theholocron/holocron";

const RAW = {
	number: 7,
	node_id: "PR_node",
	title: "feat: x",
	state: "open" as const,
	merged_at: null,
	draft: true,
	html_url: "https://github.com/theholocron/holocron/pull/7",
	head: { ref: "feat/1-x", sha: "abc" },
};

function setup(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "pat", fetch }), calls };
}

const INPUT = { title: "feat: x", head: "feat/1-x", base: "alpha" };

describe("withLink", () => {
	it("returns the body as it is with no link", () => {
		expect(withLink("body", undefined)).toBe("body");
	});

	it("adds a Refs line by default and a Closes line when asked, to an empty or a written body", () => {
		expect(withLink(undefined, { issue: "12" })).toBe("Refs #12");
		expect(withLink("Text\n", { issue: "#12", keyword: "Closes" })).toBe("Text\n\nCloses #12");
		expect(withLink("", { issue: "ENG-42", keyword: "Closes" })).toBe("Closes ENG-42");
	});

	it("leaves a body that already names the issue alone, and does not match a longer number", () => {
		expect(withLink("Closes #12", { issue: "12" })).toBe("Closes #12");
		expect(withLink("refs #123", { issue: "12" })).toBe("refs #123\n\nRefs #12");
		expect(withLink("Fixes owner/repo#12.", { issue: "owner/repo#12" })).toBe("Fixes owner/repo#12.");
	});
});

describe("createPullRequest", () => {
	it("opens a draft with the link line and reports it created", async () => {
		const { client, calls } = setup([{ body: [] }, { status: 201, body: RAW }]);
		const result = await createPullRequest(client, REPO, {
			...INPUT,
			body: "Why",
			link: { issue: "1", keyword: "Closes" },
		});
		expect(calls[0]?.url).toContain("/pulls?state=open&head=theholocron%3Afeat%2F1-x");
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.body).toEqual({ ...INPUT, body: "Why\n\nCloses #1", draft: true });
		expect(result).toEqual({
			pullRequest: {
				number: 7,
				title: "feat: x",
				state: "open",
				merged: false,
				branch: "feat/1-x",
				headSha: "abc",
				url: RAW.html_url,
			},
			created: true,
			draft: true,
			dropped: [],
		});
		expect(calls).toHaveLength(2);
	});

	it("opens a ready pull request when draft is false", async () => {
		const { client, calls } = setup([{ body: [] }, { status: 201, body: { ...RAW, draft: false } }]);
		const result = await createPullRequest(client, REPO, { ...INPUT, draft: false });
		expect((calls[1]?.body as { draft: boolean }).draft).toBe(false);
		expect(result.draft).toBe(false);
	});

	it("reuses an open pull request for the same head and makes no second one", async () => {
		const { client, calls } = setup([{ body: [RAW] }]);
		const result = await createPullRequest(client, REPO, INPUT);
		expect(result.created).toBe(false);
		expect(result.pullRequest.number).toBe(7);
		expect(calls).toHaveLength(1);
	});

	it("mirrors labels, assignees (added to the existing), milestone and boards", async () => {
		const { client, calls } = setup([
			{ body: [] },
			{ status: 201, body: RAW },
			{ body: undefined, status: 200 }, // addLabels
			{ body: { number: 7, assignees: [{ login: "a" }] } }, // getIssue
			{ body: [{ number: 3, title: "v1" }] }, // milestones
			{ body: {} }, // updateIssue
			{
				body: {
					data: { organization: { projectsV2: { nodes: [{ id: "P1", title: "Roadmap", closed: false }] } } },
				},
			},
			{ body: { data: { addProjectV2ItemById: { item: { id: "I1" } } } } },
		]);
		const result = await createPullRequest(client, REPO, {
			...INPUT,
			labels: ["area:cli"],
			assignees: ["@b", "a"],
			milestone: "v1",
			projects: ["Roadmap"],
		});
		expect(calls[2]?.url).toContain("/issues/7/labels");
		expect(calls[2]?.body).toEqual({ labels: ["area:cli"] });
		expect(calls[5]?.method).toBe("PATCH");
		expect(calls[5]?.body).toEqual({ assignees: ["a", "b"], milestone: 3 });
		expect((calls[7]?.body as { variables: unknown }).variables).toEqual({ project: "P1", content: "PR_node" });
		expect(result.dropped).toEqual([]);
	});

	it("reports a missing milestone and board, and a board that refuses, by name and never creates them", async () => {
		const { client, calls } = setup([
			{ body: [] },
			{ status: 201, body: RAW },
			{ body: [] }, // milestones
			{
				body: {
					data: { organization: { projectsV2: { nodes: [{ id: "P1", title: "Roadmap", closed: false }] } } },
				},
			},
			{ status: 403, body: { message: "no" } }, // add refused
		]);
		const result = await createPullRequest(client, REPO, {
			...INPUT,
			milestone: "v9",
			projects: ["Roadmap", "Nope"],
		});
		expect(result.dropped).toEqual(["milestone v9", "project Roadmap", "project Nope"]);
		expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
	});

	it("drops every board when the boards cannot be read or the pull request has no node id", async () => {
		const failing = setup([{ body: [] }, { status: 201, body: RAW }, { status: 403, body: { message: "no" } }]);
		expect((await createPullRequest(failing.client, REPO, { ...INPUT, projects: ["A"] })).dropped).toEqual([
			"project A",
		]);
		const noId = setup([{ body: [] }, { status: 201, body: { ...RAW, node_id: undefined } }]);
		expect((await createPullRequest(noId.client, REPO, { ...INPUT, projects: ["A"] })).dropped).toEqual([
			"project A",
		]);
	});

	it("leaves assignees alone when they are all already there", async () => {
		const { client, calls } = setup([{ body: [RAW] }, { body: { number: 7, assignees: [{ login: "a" }] } }]);
		await createPullRequest(client, REPO, { ...INPUT, assignees: ["a"] });
		expect(calls).toHaveLength(2);
	});
});

describe("updatePullRequest", () => {
	it("PATCHes only the pull request's own fields that the patch names", async () => {
		const { client, calls } = setup([{ body: { ...RAW, title: "fix: y" } }]);
		const result = await updatePullRequest(client, REPO, 7, {
			title: "fix: y",
			body: "b",
			base: "main",
			state: "closed",
		});
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain("/pulls/7");
		expect(calls[0]?.body).toEqual({ title: "fix: y", body: "b", base: "main", state: "closed" });
		expect(result.created).toBe(false);
		expect(result.pullRequest.title).toBe("fix: y");
	});

	it("reads the pull request and writes nothing when the patch has only mirrored fields, adding and removing labels", async () => {
		const { client, calls } = setup([
			{ body: RAW },
			{ body: undefined },
			{ body: undefined },
			{ status: 404, body: { message: "x" } },
		]);
		const result = await updatePullRequest(client, REPO, 7, {
			labels: ["area:cli"],
			removeLabels: ["area:docs", "area:gone"],
		});
		expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "DELETE", "DELETE"]);
		expect(calls[2]?.url).toContain("/issues/7/labels/area%3Adocs");
		expect(result.dropped).toEqual([]);
	});

	it("makes no call beyond the read for an empty patch", async () => {
		const { client, calls } = setup([{ body: RAW }]);
		await updatePullRequest(client, REPO, 7, {});
		expect(calls).toHaveLength(1);
	});
});

describe("markReady", () => {
	it("sends the mutation for an open draft and answers true", async () => {
		const { client, calls } = setup([
			{ body: RAW },
			{ body: { data: { markPullRequestReadyForReview: { pullRequest: { id: "PR_node", isDraft: false } } } } },
		]);
		await expect(markReady(client, REPO, 7)).resolves.toBe(true);
		expect((calls[1]?.body as { variables: unknown }).variables).toEqual({ pullRequestId: "PR_node" });
	});

	it("does nothing for a pull request that is not a draft, or is closed", async () => {
		const notDraft = setup([{ body: { ...RAW, draft: false } }]);
		await expect(markReady(notDraft.client, REPO, 7)).resolves.toBe(false);
		expect(notDraft.calls).toHaveLength(1);
		const closed = setup([{ body: { ...RAW, state: "closed" } }]);
		await expect(markReady(closed.client, REPO, 7)).resolves.toBe(false);
	});

	it("fails clearly when GitHub gave no node id", async () => {
		const { client } = setup([{ body: { ...RAW, node_id: undefined } }]);
		await expect(markReady(client, REPO, 7)).rejects.toThrow(/no node id/);
	});
});

describe("pull requests without optional fields", () => {
	it("treats a missing draft flag as not a draft and a missing assignees list as empty", async () => {
		const noDraft = { ...RAW, draft: undefined };
		const created = setup([{ body: [] }, { status: 201, body: noDraft }, { body: { number: 7 } }, { body: {} }]);
		const result = await createPullRequest(created.client, REPO, { ...INPUT, assignees: ["a"] });
		expect(result.draft).toBe(false);
		expect(created.calls[3]?.body).toEqual({ assignees: ["a"] });
		const updated = setup([{ body: noDraft }]);
		expect((await updatePullRequest(updated.client, REPO, 7, {})).draft).toBe(false);
	});
});
