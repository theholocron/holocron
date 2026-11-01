import { describe, expect, it } from "vitest";

import type { ProbeContext, ProbeRow } from "../../../plugin/index.js";
import type { SpecsAnnounceIo } from "./specs.type.js";
import { specsAnnounceProbe } from "./specs-announce-probe.js";

const PR_URL = "https://github.com/theholocron/holocron/pull/1537";
const spec = (status: string, title = "Channel content"): string => `---\nstatus: ${status}\n---\n# ${title}\n`;

/** An in-memory repo: revision to path to text. `changed` stands in for `git diff --name-only`. */
function makeIo(
	revs: Record<string, Record<string, string>>,
	changed: string[] | Error,
	env: Record<string, string | undefined> = {}
) {
	const outputs: Record<string, string> = {};
	const io: SpecsAnnounceIo = {
		env: {
			SPEC_EVENT: "opened",
			BEFORE_SHA: "base",
			AFTER_SHA: "head",
			PR_NUMBER: "1537",
			PR_URL,
			...env,
		},
		changedFiles: () => {
			if (changed instanceof Error) throw changed;
			return changed;
		},
		readAt: (rev, path) => revs[rev]?.[path],
		setOutput: (name, value) => {
			outputs[name] = value;
		},
	};
	return { io, outputs };
}

async function run(io: SpecsAnnounceIo): Promise<ProbeRow[]> {
	const rows: ProbeRow[] = [];
	await specsAnnounceProbe(io).run({
		dryRun: false,
		say: (row: ProbeRow) => rows.push(row),
	} as unknown as ProbeContext);
	return rows;
}

describe("specsAnnounceProbe", () => {
	it("writes the post for a new spec, naming it, and sets post to true", async () => {
		const { io, outputs } = makeIo({ head: { ".notes/tech-x.spec.md": spec("proposed") } }, [
			".notes/tech-x.spec.md",
		]);

		const rows = await run(io);

		expect(rows).toEqual([
			{ status: "heading", label: "Spec announcement" },
			{ status: "ok", label: ".notes/tech-x.spec.md", detail: "new: Channel content" },
		]);
		expect(outputs).toEqual({
			post: "true",
			message: `💡 New spec: **Channel content** (proposed)\nPull request #1537: <${PR_URL}>`,
		});
	});

	it("reads the file before and after, so a status change is announced as one", async () => {
		const { io, outputs } = makeIo(
			{ base: { ".notes/a.spec.md": spec("draft") }, head: { ".notes/a.spec.md": spec("proposed") } },
			[".notes/a.spec.md"]
		);

		await run(io);

		expect(outputs["message"]).toContain("🔀 Spec status: **Channel content**, draft → proposed");
	});

	it("announces several specs in one post, and leaves out files that are not specs", async () => {
		const { io, outputs } = makeIo(
			{
				head: {
					".notes/a.spec.md": spec("draft", "A"),
					".notes/b.spec.md": spec("proposed", "B"),
					".notes/README.md": "x",
				},
			},
			[".notes/a.spec.md", ".notes/README.md", ".notes/b.spec.md"]
		);

		await run(io);

		expect(outputs["message"]?.split("\n")).toEqual([
			"💡 New spec: **A** (draft)",
			"💡 New spec: **B** (proposed)",
			`Pull request #1537: <${PR_URL}>`,
		]);
	});

	it("sets post to false and says why when nothing is worth announcing", async () => {
		const { io, outputs } = makeIo(
			{ base: { ".notes/a.spec.md": spec("draft") }, head: { ".notes/a.spec.md": spec("draft", "Typo fixed") } },
			[".notes/a.spec.md"],
			{ SPEC_EVENT: "updated" }
		);

		const rows = await run(io);

		expect(rows.at(-1)).toEqual({ status: "info", label: "announcement", detail: "no spec to announce" });
		expect(outputs).toEqual({ post: "false" });
	});

	it("announces a merge with the status the spec landed with", async () => {
		const { io, outputs } = makeIo(
			{ base: { ".notes/a.spec.md": spec("proposed") }, head: { ".notes/a.spec.md": spec("accepted") } },
			[".notes/a.spec.md"],
			{ SPEC_EVENT: "merged" }
		);

		await run(io);

		expect(outputs["message"]).toContain("✅ Spec merged: **Channel content** (accepted)");
	});

	it.each([
		["no event", { SPEC_EVENT: undefined }],
		["an unknown event", { SPEC_EVENT: "closed" }],
		["no base", { BEFORE_SHA: "" }],
		["no head", { AFTER_SHA: undefined }],
		["a pull request number that is not a number", { PR_NUMBER: "abc" }],
		["no pull request number", { PR_NUMBER: undefined }],
		["no pull request address", { PR_URL: undefined }],
		["a pull request address that is not https", { PR_URL: "javascript:alert(1)" }],
	])("skips, without reading git, for %s", async (_name, env) => {
		const { io, outputs } = makeIo({}, new Error("git must not be asked"), env);

		const rows = await run(io);

		expect(rows.at(-1)).toMatchObject({
			status: "info",
			detail: expect.stringContaining("skipped: needs SPEC_EVENT"),
		});
		expect(outputs).toEqual({ post: "false" });
	});

	it("skips when git cannot say which files changed", async () => {
		const { io, outputs } = makeIo({}, new Error("bad revision"));

		const rows = await run(io);

		expect(rows.at(-1)).toEqual({
			status: "info",
			label: "announcement",
			detail: "could not determine the changed files; skipped",
		});
		expect(outputs).toEqual({ post: "false" });
	});
});
