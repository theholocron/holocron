import { describe, expect, it, vi } from "vitest";

import type { DiscussionPost, Notifications } from "../../plugin/index.js";
import type { SpecDocument } from "./specs-sync.type.js";
import { syncDocument } from "./sync-document.js";

const URL = "https://discord.com/channels/1/2";
const PR = { number: 1538, url: "https://github.com/o/r/pull/1538" };
const spec = (status: string, extra: string[] = []): SpecDocument => ({
	path: ".notes/tech-x.spec.md",
	kind: "spec",
	text: `---\nid: SPEC-0001\nstatus: ${status}\nissue: o/r#1\n${extra.join("\n")}${extra.length ? "\n" : ""}---\n\n# Channel content\n\n## Problem\n\nContent is typed by hand.\n`,
});
const adr = (status: string): SpecDocument => ({
	path: "docs/wiki/decisions/0001-x.md",
	kind: "adr",
	text: `---\nid: ADR-0001\ntitle: X\nstatus: ${status}\ndate: 2026-01-01\n---\n\n# Use X\n\n## Context\n\nWe need X.\n`,
});

function provider(existing: DiscussionPost | undefined) {
	const n = {
		key: "notifications",
		providerName: "discord",
		readDiscussion: vi.fn(async () => existing),
		ensureDiscussion: vi.fn(async () => ({
			post: existing ?? { url: URL, state: "proposed", synced: "proposed" },
			created: existing === undefined,
		})),
		updateDiscussion: vi.fn(async () => {}),
	};
	return { n, notifications: n as unknown as Notifications };
}
const deps = (notifications: Notifications, over: object = {}) => ({
	notifications,
	channel: "ideas",
	dryRun: false,
	quiet: true,
	pr: PR,
	...over,
});
const linked = (doc: SpecDocument) => doc.text.replace("issue: o/r#1\n", `issue: o/r#1\ndiscussion:\n  url: ${URL}\n`);

describe("syncDocument", () => {
	it("makes the post: a title, then its id, a short description and the pull request; and links it in the file", async () => {
		const { n, notifications } = provider(undefined);

		const out = await syncDocument(spec("proposed"), deps(notifications));

		expect(n.ensureDiscussion).toHaveBeenCalledWith({
			channel: "ideas",
			key: ".notes/tech-x.spec.md",
			title: "💡 New spec: Channel content",
			body: `SPEC-0001\n\nContent is typed by hand.\n\nPR: [#1538](<${PR.url}>)`,
			state: "proposed",
			quiet: true,
			closed: false,
		});
		expect(out.did).toEqual(["made the post", "linked the post"]);
		expect(out.text).toContain(`discussion:\n  url: ${URL}`);
		expect(out.problem).toBeUndefined();
		expect(n.updateDiscussion).not.toHaveBeenCalled();
	});

	it("titles an ADR 📐 New ADR:, opens with its id, and leaves out the pull request when it is not known", async () => {
		const { n, notifications } = provider(undefined);

		await syncDocument(adr("accepted"), deps(notifications, { pr: undefined }));

		expect(n.ensureDiscussion).toHaveBeenCalledWith(
			expect.objectContaining({ title: "📐 New ADR: Use X", body: "ADR-0001\n\nWe need X.", state: "accepted" })
		);
	});

	it("numbers a spec that has no id, writes it first in the front matter, and opens the post with it", async () => {
		const { n, notifications } = provider(undefined);
		const bare: SpecDocument = {
			...spec("proposed"),
			text: spec("proposed").text.replace("id: SPEC-0001\n", ""),
		};

		const out = await syncDocument(bare, deps(notifications, { assignedId: "SPEC-0042" }));

		expect(out.did).toEqual(["numbered it SPEC-0042", "made the post", "linked the post"]);
		expect(out.text.startsWith("---\nid: SPEC-0042\nstatus: proposed\n")).toBe(true);
		expect(n.ensureDiscussion).toHaveBeenCalledWith(
			expect.objectContaining({ body: expect.stringMatching(/^SPEC-0042\n\n/) })
		);
	});

	it("says it would number a spec on a dry run, and writes nothing", async () => {
		const { n, notifications } = provider(undefined);
		const bare: SpecDocument = { ...spec("proposed"), text: spec("proposed").text.replace("id: SPEC-0001\n", "") };

		const out = await syncDocument(bare, deps(notifications, { dryRun: true, assignedId: "SPEC-0042" }));

		expect(out.did).toEqual(["would number it SPEC-0042", "would make the post and link it"]);
		expect(n.ensureDiscussion).not.toHaveBeenCalled();
	});

	it("cannot sync a document that has no id and is given none", async () => {
		const { n, notifications } = provider(undefined);
		const bare: SpecDocument = { ...spec("proposed"), text: spec("proposed").text.replace("id: SPEC-0001\n", "") };

		const out = await syncDocument(bare, deps(notifications));

		expect(out.problem).toMatch(/has no id in its front matter/);
		expect(n.ensureDiscussion).not.toHaveBeenCalled();
	});

	it("lets a new post notify people only when asked to", async () => {
		const { n, notifications } = provider(undefined);
		await syncDocument(spec("draft"), deps(notifications, { quiet: false }));
		expect(n.ensureDiscussion).toHaveBeenCalledWith(expect.objectContaining({ quiet: false }));
	});

	it("does nothing when the post, the tag and the file are all in step and linked", async () => {
		const doc = spec("proposed", [`discussion:`, `  url: ${URL}`]);
		const { n, notifications } = provider({ url: URL, state: "proposed", synced: "proposed" });

		const out = await syncDocument(doc, deps(notifications));

		expect(out).toEqual({ path: doc.path, did: [], text: doc.text });
		expect(n.updateDiscussion).not.toHaveBeenCalled();
	});

	it("replaces a link that points somewhere else", async () => {
		const doc = spec("proposed", ["discussion:", "  url: https://old"]);
		const { notifications } = provider({ url: URL, state: "proposed", synced: "proposed" });

		const out = await syncDocument(doc, deps(notifications));

		expect(out.did).toEqual(["linked the post"]);
		expect(out.text).toContain(`  url: ${URL}`);
		expect(out.text).not.toContain("https://old");
	});

	it("puts the file's status on the tag when only the file moved", async () => {
		const { n, notifications } = provider({ url: URL, state: "proposed", synced: "proposed" });

		const out = await syncDocument(linkedDoc(spec("accepted")), deps(notifications));

		expect(out.did).toEqual(["set the tag to accepted"]);
		expect(n.updateDiscussion).toHaveBeenCalledWith("ideas", ".notes/tech-x.spec.md", {
			state: "accepted",
			synced: "accepted",
		});
	});

	it("records that the post and the file agree when the last-synced status is stale", async () => {
		const { n, notifications } = provider({ url: URL, state: "accepted", synced: "proposed" });

		const out = await syncDocument(linkedDoc(spec("accepted")), deps(notifications));

		expect(out.did).toEqual(["recorded that the post and the file agree"]);
		expect(n.updateDiscussion).toHaveBeenCalledWith("ideas", ".notes/tech-x.spec.md", { synced: "accepted" });
	});

	it("changes the file's status when the tag was changed, and leaves the post's synced status for the merge", async () => {
		const { n, notifications } = provider({ url: URL, state: "accepted", synced: "proposed" });
		const doc = linkedDoc(spec("proposed"));

		const out = await syncDocument(doc, deps(notifications));

		expect(out.did).toEqual(["moved status to accepted, as the tag asks"]);
		expect(out.text).toContain("status: accepted");
		expect(out.text).not.toContain("status: proposed");
		expect(n.updateDiscussion).not.toHaveBeenCalled();
	});

	it("refuses a retag to a status the document's kind does not have", async () => {
		const { n, notifications } = provider({ url: URL, state: "archived", synced: "proposed" });
		const doc = adr("proposed");

		const out = await syncDocument(doc, deps(notifications));

		expect(out.problem).toBe(
			"the tag asks for `archived`, which is not a status of an ADR; retag it or change the file"
		);
		expect(out.text).toBe(doc.text);
		expect(n.updateDiscussion).not.toHaveBeenCalled();
	});

	it("reports a conflict and changes nothing", async () => {
		const { n, notifications } = provider({ url: URL, state: "archived", synced: "draft" });
		const doc = linkedDoc(spec("accepted"));

		const out = await syncDocument(doc, deps(notifications));

		expect(out.problem).toBe("the file moved to accepted and the tag to archived since they last agreed on draft");
		expect(out.text).toBe(doc.text);
		expect(n.updateDiscussion).not.toHaveBeenCalled();
	});

	it("reports a document with no status, and one with a status its kind does not have, without touching the provider", async () => {
		const { n, notifications } = provider(undefined);
		const none: SpecDocument = { path: ".notes/x.spec.md", kind: "spec", text: "# No front matter\n" };

		const missing = await syncDocument(none, deps(notifications));
		const wrong = await syncDocument(spec("rejected"), deps(notifications));

		expect(missing.problem).toMatch(/has no status in its front matter/);
		expect(wrong.problem).toBe("status `rejected` is not a status of an SPEC");
		expect(n.ensureDiscussion).not.toHaveBeenCalled();
		expect(n.readDiscussion).not.toHaveBeenCalled();
	});

	describe("closing finished posts", () => {
		const open = { url: URL, state: "proposed", synced: "proposed" } as const;

		it("makes the post closed for a document that is already finished with, and open for any other", async () => {
			const finished = provider(undefined);
			const live = provider(undefined);

			await syncDocument(spec("archived"), deps(finished.notifications));
			await syncDocument(adr("rejected"), deps(live.notifications));
			await syncDocument(spec("accepted"), deps(live.notifications));

			expect(finished.n.ensureDiscussion).toHaveBeenCalledWith(expect.objectContaining({ closed: true }));
			expect(live.n.ensureDiscussion).toHaveBeenNthCalledWith(1, expect.objectContaining({ closed: true }));
			expect(live.n.ensureDiscussion).toHaveBeenNthCalledWith(2, expect.objectContaining({ closed: false }));
		});

		it("closes an open post whose document is finished with, and leaves one already closed alone", async () => {
			const stillOpen = provider({ url: URL, state: "archived", synced: "archived" });
			const closed = provider({ url: URL, state: "archived", synced: "archived", closed: true });

			const out = await syncDocument(linkedDoc(spec("archived")), deps(stillOpen.notifications));
			const quiet = await syncDocument(linkedDoc(spec("archived")), deps(closed.notifications));

			expect(out.did).toEqual(["closed the post"]);
			expect(stillOpen.n.updateDiscussion).toHaveBeenCalledWith("ideas", ".notes/tech-x.spec.md", {
				closed: true,
			});
			expect(quiet.did).toEqual([]);
			expect(closed.n.updateDiscussion).not.toHaveBeenCalled();
		});

		it("reopens a closed post whose document is back in an open status", async () => {
			const { n, notifications } = provider({ ...open, closed: true });

			const out = await syncDocument(linkedDoc(spec("proposed")), deps(notifications));

			expect(out.did).toEqual(["reopened the post"]);
			expect(n.updateDiscussion).toHaveBeenCalledWith("ideas", ".notes/tech-x.spec.md", { closed: false });
		});

		it("follows the tag at once when a gatekeeper retags to a finished status, before the file's pull request merges", async () => {
			const { n, notifications } = provider({ url: URL, state: "archived", synced: "proposed" });

			const out = await syncDocument(linkedDoc(spec("proposed")), deps(notifications));

			expect(out.did).toEqual(["moved status to archived, as the tag asks", "closed the post"]);
			expect(n.updateDiscussion).toHaveBeenCalledTimes(1);
			expect(n.updateDiscussion).toHaveBeenCalledWith("ideas", ".notes/tech-x.spec.md", { closed: true });
		});

		it("says what it would do on a dry run, and does it for neither", async () => {
			const toClose = provider({ url: URL, state: "archived", synced: "archived" });
			const toReopen = provider({ ...open, closed: true });
			const dry = { dryRun: true };

			const close = await syncDocument(linkedDoc(spec("archived")), deps(toClose.notifications, dry));
			const reopen = await syncDocument(linkedDoc(spec("proposed")), deps(toReopen.notifications, dry));

			expect(close.did).toEqual(["would close the post"]);
			expect(reopen.did).toEqual(["would reopen the post"]);
			expect(toClose.n.updateDiscussion).not.toHaveBeenCalled();
			expect(toReopen.n.updateDiscussion).not.toHaveBeenCalled();
		});
	});

	describe("on a dry run", () => {
		it("says it would make and link a post that does not exist, and makes nothing", async () => {
			const { n, notifications } = provider(undefined);
			const doc = spec("proposed");

			const out = await syncDocument(doc, deps(notifications, { dryRun: true }));

			expect(out).toEqual({ path: doc.path, did: ["would make the post and link it"], text: doc.text });
			expect(n.ensureDiscussion).not.toHaveBeenCalled();
		});

		it("says what it would do for a post that exists, and changes nothing", async () => {
			const tag = provider({ url: URL, state: "proposed", synced: "proposed" });
			const record = provider({ url: URL, state: "accepted", synced: "proposed" });
			const request = provider({ url: URL, state: "accepted", synced: "proposed" });
			const dry = { dryRun: true };

			const setTag = await syncDocument(spec("accepted"), deps(tag.notifications, dry));
			const recorded = await syncDocument(linkedDoc(spec("accepted")), deps(record.notifications, dry));
			const asked = await syncDocument(linkedDoc(spec("proposed")), deps(request.notifications, dry));

			expect(setTag.did).toEqual(["would set the tag to accepted", "would link the post"]);
			expect(recorded.did).toEqual(["would record that the post and the file agree"]);
			expect(asked.did).toEqual(["would move status to accepted, as the tag asks"]);
			for (const p of [tag, record, request]) expect(p.n.updateDiscussion).not.toHaveBeenCalled();
		});
	});
});

function linkedDoc(doc: SpecDocument): SpecDocument {
	return { ...doc, text: linked(doc) };
}
