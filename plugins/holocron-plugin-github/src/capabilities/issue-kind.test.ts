import type { IssueRecord } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../rest.js";
import { withIssueFields } from "./issue-fields.testing.js";
import { GitHubIssues } from "./issues.js";

const REPO = "theholocron/holocron";
const URL_1 = "https://linear.app/x/issue/ENG-1";

function make(responses: Parameters<typeof stubFetch>[0]) {
	const stub = stubFetch(responses);
	const { fetch } = withIssueFields(stub.fetch, {});
	return {
		issues: new GitHubIssues(createGitHubClient({ token: "pat", fetch }), { repo: REPO }),
		calls: stub.calls,
	};
}

const raw = (over: Record<string, unknown> = {}) => ({
	id: 1,
	number: 7,
	title: "Fix it",
	body: "details",
	state: "open",
	labels: [],
	assignee: null,
	updated_at: "2026-02-01T00:00:00Z",
	created_at: "2026-01-01T00:00:00Z",
	html_url: "https://github.com/theholocron/holocron/issues/7",
	milestone: null,
	...over,
});

const links = { body: { data: { repository: { issue: { parent: null, blockedBy: { nodes: [] } } } } } };

const record = (over: Partial<IssueRecord> = {}): IssueRecord => ({
	key: "ENG-1",
	url: URL_1,
	title: "From Linear",
	body: "text",
	statusCategory: "open",
	closed: false,
	labels: [],
	blockedBy: [],
	comments: [],
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-03T00:00:00Z",
	...over,
});

const BODY = `text\n\n---\n_Migrated from [ENG-1](${URL_1}); created 2026-01-01T00:00:00Z._\n<!-- holocron:migrated-from ${URL_1} -->`;
const made = (over: Record<string, unknown> = {}) => ({
	...raw({ number: 30, title: "From Linear", body: BODY }),
	...over,
});

describe("GitHubIssues export, the issue kind (#2485)", () => {
	const exported = async (over: Record<string, unknown>) => {
		const { issues } = make([{ body: raw(over) }, { body: [] }, links]);
		return (await issues.export({ keys: ["#7"] }))[0];
	};

	it("exports the Type as the kind, and the Type wins over a label", async () => {
		expect((await exported({ type: { name: "Feature" }, labels: [{ name: "bug" }] }))?.kind).toBe("feature");
		expect((await exported({ type: { name: "Task" } }))?.kind).toBe("task");
	});

	it("falls back to the one kind label, and names none for two kinds or no label", async () => {
		expect((await exported({ type: null, labels: [{ name: "enhancement" }] }))?.kind).toBe("feature");
		expect((await exported({ labels: [{ name: "Chore" }, { name: "chore" }] }))?.kind).toBe("task");
		expect((await exported({ labels: [{ name: "bug" }, { name: "chore" }] }))?.kind).toBeUndefined();
		expect((await exported({ type: null }))?.kind).toBeUndefined();
	});

	it("reads a Type outside the core three as its lower-case name, so an Epic is not lost", async () => {
		expect((await exported({ type: { name: "Epic" } }))?.kind).toBe("epic");
	});
});

describe("GitHubIssues import, the issue kind (#2485)", () => {
	it("writes the kind as the Type and adds no kind label of its own", async () => {
		const { issues, calls } = make([{ body: [] }, { body: { number: 12 } }, { body: {} }]);
		const [res] = await issues.import([record({ kind: "feature" })]);
		expect((calls[1]?.body as { labels?: string[] }).labels).toBeUndefined();
		expect(calls[2]?.body).toEqual({ type: "Feature" });
		expect(res?.dropped.join(" ")).not.toContain("kind");
	});

	it("reports a Type GitHub refuses in `dropped`, and throws on any other error", async () => {
		const refused = make([{ body: [] }, { body: { number: 12 } }, { status: 422, body: { message: "no type" } }]);
		const [res] = await refused.issues.import([record({ kind: "bug" })]);
		expect(res).toMatchObject({ key: "#12", created: true });
		expect(res?.dropped).toContain("kind Bug (GitHub refused: 422)");

		const broken = make([{ body: [] }, { body: { number: 12 } }, { status: 500, body: { message: "boom" } }]);
		await expect(broken.issues.import([record({ kind: "bug" })])).rejects.toThrow();
	});

	it("writes no Type on a dry run, and none for a record without a kind", async () => {
		const dry = make([{ body: [] }]);
		await dry.issues.import([record({ kind: "bug" })], { dryRun: true });
		expect(dry.calls).toHaveLength(1);

		const bare = make([{ body: [] }, { body: { number: 12 } }]);
		await bare.issues.import([record()]);
		expect(bare.calls).toHaveLength(2);
	});
});

describe("GitHubIssues sync, the issue kind (#2485)", () => {
	it("sets the Type of a new issue, and reports a refusal in `dropped`", async () => {
		const ok = make([{ body: [] }, { body: { number: 12 } }, { body: {} }]);
		const [res] = (await ok.issues.sync?.([record({ kind: "task" })])) ?? [];
		expect(ok.calls[2]?.body).toEqual({ type: "Task" });
		expect(res?.dropped.join(" ")).not.toContain("kind");

		const refused = make([{ body: [] }, { body: { number: 12 } }, { status: 404, body: { message: "none" } }]);
		const [bad] = (await refused.issues.sync?.([record({ kind: "task" })])) ?? [];
		expect(bad?.dropped).toContain("kind Task (GitHub refused: 404)");
	});

	it("sets the Type of an issue it made when it differs, and leaves one that already matches", async () => {
		const differs = make([{ body: [made({ type: { name: "Bug" } })] }, { body: {} }, { body: [] }]);
		const [res] = (await differs.issues.sync?.([record({ kind: "feature" })])) ?? [];
		expect(res).toMatchObject({ updated: true, changes: ["kind"] });
		expect(differs.calls[1]?.body).toEqual({ type: "Feature" });

		const same = make([{ body: [made({ type: { name: "bug" } })] }, { body: [] }]);
		const [unchanged] = (await same.issues.sync?.([record({ kind: "bug" })])) ?? [];
		expect(unchanged).toMatchObject({ updated: false, changes: [] });
		expect(same.calls).toHaveLength(2);
	});

	it("reports a refused Type on an update, and only says it would set it on a dry run", async () => {
		const refused = make([{ body: [made()] }, { status: 403, body: { message: "no" } }, { body: [] }]);
		const [res] = (await refused.issues.sync?.([record({ kind: "bug" })])) ?? [];
		expect(res?.dropped).toContain("kind Bug (GitHub refused: 403)");

		const dry = make([{ body: [made()] }, { body: [] }]);
		const [would] = (await dry.issues.sync?.([record({ kind: "bug" })], { dryRun: true })) ?? [];
		expect(would).toMatchObject({ updated: true, changes: ["kind"] });
		expect(dry.calls).toHaveLength(2);
	});
});
