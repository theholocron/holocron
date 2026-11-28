import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { isDocsFile, validateDocsPresence } from "./validate-docs-presence.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

function file(filename: string, status: "added" | "modified" | "removed" = "added", patch?: string) {
	return { filename, status, ...(patch === undefined ? {} : { patch }) };
}

function pkgJson(body: Record<string, unknown>) {
	return {
		status: 200,
		body: { content: Buffer.from(JSON.stringify(body)).toString("base64"), encoding: "base64" },
	};
}

function commit(message: string) {
	return { sha: "s", commit: { message }, author: null, parents: [] };
}

const NOT_FOUND = { status: 404, body: { message: "Not Found" } };

const run = (client: ReturnType<typeof makeClient>["client"], extra: { prTitle?: string; prBody?: string } = {}) =>
	validateDocsPresence({ client, repo: "acme/demo", pullNumber: 9, ref: "pr-head", ...extra });

describe("isDocsFile", () => {
	it("counts anything under docs/ and any .md/.mdx file", () => {
		expect(isDocsFile("docs/src/content/x.ts")).toBe(true);
		expect(isDocsFile("packages/x/README.md")).toBe(true);
		expect(isDocsFile("site/page.mdx")).toBe(true);
		expect(isDocsFile("packages/x/src/index.ts")).toBe(false);
	});
});

describe("validateDocsPresence -- new packages", () => {
	it("is valid when the PR changes no source of any package, reading nothing but the file list", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("scripts/a.mjs"), file("README.md")] }]);

		expect(await run(client)).toMatchObject({ newPackages: [], valid: true, isFeat: false, featWarnings: [] });
		expect(calls).toHaveLength(1);
	});

	it("flags a new public package in any workspace layout, reading its package.json at the head ref", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: [file("utils/widget/src/index.ts"), file("utils/widget/package.json")] },
			pkgJson({ name: "@acme/widget" }),
			{ status: 200, body: [commit("fix: nothing")] },
		]);

		const result = await run(client);
		expect(result.newPackages).toEqual([{ name: "widget", entry: "utils/widget/src/index.ts" }]);
		expect(result).toMatchObject({ hasDocsChange: false, valid: false, isFeat: false });
		expect(decodeURIComponent(calls[1]!.url)).toContain("/contents/utils/widget/package.json?ref=pr-head");
	});

	it("passes a new public package that comes with a docs change", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("packages/widget/src/index.ts"), file("packages/widget/README.md")] },
			pkgJson({ name: "@acme/widget" }),
			{ status: 200, body: [commit("fix: x")] },
		]);

		expect(await run(client)).toMatchObject({ hasDocsChange: true, valid: true });
	});

	it("ignores private packages and a package.json that is missing or not JSON", async () => {
		const { client } = makeClient([
			{
				status: 200,
				body: [
					file("a/src/index.ts"),
					file("b/src/index.ts"),
					file("c/src/index.ts"),
					file("node_modules/x/src/index.ts"),
					file("d/src/index.ts", "modified"),
				],
			},
			pkgJson({ name: "internal", private: true }),
			NOT_FOUND,
			{ status: 200, body: { content: Buffer.from("{not json").toString("base64"), encoding: "base64" } },
			NOT_FOUND,
		]);

		expect(await run(client)).toMatchObject({ newPackages: [], valid: true });
	});

	it("rethrows any other failure reading package.json -- a real error, not a skip", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("a/src/index.ts")] },
			{ status: 500, body: { message: "boom" } },
		]);

		const err = await run(client).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as { status?: number }).status).toBe(500);
	});
});

describe("validateDocsPresence -- the feat rule", () => {
	const source = (patch?: string) => [file("utils/array-utils/src/a.ts", "modified", patch)];

	it("does not warn for a PR that is not a feat", async () => {
		const { client } = makeClient([
			{ status: 200, body: source() },
			pkgJson({ name: "@acme/array-utils" }),
			{ status: 200, body: [commit("fix: a bug\n\nbody")] },
		]);

		expect(await run(client, { prTitle: "fix: a bug" })).toMatchObject({
			isFeat: false,
			featWarnings: [],
			valid: true,
		});
	});

	it("warns, anchored on a changed file, for a feat read from the PR title", async () => {
		const { client } = makeClient([
			{ status: 200, body: source() },
			pkgJson({ name: "@acme/array-utils" }),
			{ status: 200, body: [commit("wip")] },
		]);

		expect(await run(client, { prTitle: "feat(array-utils): add a thing" })).toMatchObject({
			isFeat: true,
			featWarnings: [{ dir: "utils/array-utils", path: "utils/array-utils/src/a.ts" }],
			valid: false,
		});
	});

	it("reads the feat from a commit subject when the title is empty", async () => {
		const { client } = makeClient([
			{ status: 200, body: source() },
			pkgJson({ name: "@acme/array-utils" }),
			{ status: 200, body: [commit("feat: add a thing\n\nlong body")] },
		]);

		expect(await run(client)).toMatchObject({ isFeat: true, valid: false });
	});

	it("accepts an added doc comment, a changed README or a docs page as a docs signal", async () => {
		const comment = makeClient([
			{ status: 200, body: source("@@ -1 +1,2 @@\n+/** Says what it does. */\n+export const x = 1;") },
			pkgJson({ name: "p" }),
			{ status: 200, body: [commit("feat: x")] },
		]);
		expect(await run(comment.client)).toMatchObject({ isFeat: true, featWarnings: [], valid: true });

		const readme = makeClient([
			{ status: 200, body: [...source(), file("utils/array-utils/README.md", "modified")] },
			pkgJson({ name: "p" }),
			{ status: 200, body: [commit("feat: x")] },
		]);
		expect(await run(readme.client)).toMatchObject({ featWarnings: [], valid: true });
	});

	it("counts a doc comment in a root index of the package, not in an unrelated file", async () => {
		const { client } = makeClient([
			{
				status: 200,
				body: [file("utils/array-utils/index.ts", "modified", "+/** Documented. */"), file("utils/other.ts")],
			},
			pkgJson({ name: "p" }),
			{ status: 200, body: [commit("feat: x")] },
		]);

		expect(await run(client)).toMatchObject({ featWarnings: [], valid: true });
	});

	it("excuses the warning with a [skip docs] reason from the PR description or a commit message", async () => {
		const fromBody = makeClient([
			{ status: 200, body: source() },
			pkgJson({ name: "p" }),
			{ status: 200, body: [commit("feat: x")] },
		]);
		expect(await run(fromBody.client, { prBody: "Notes\n[skip docs] internal option" })).toMatchObject({
			featWarnings: [],
			skipped: [{ dir: "utils/array-utils", reason: "internal option" }],
			valid: true,
		});

		const fromCommit = makeClient([
			{ status: 200, body: source() },
			pkgJson({ name: "p" }),
			{ status: 200, body: [commit("feat: x\n\n[skip docs: array-utils] no page change")] },
		]);
		expect(await run(fromCommit.client)).toMatchObject({
			skipped: [{ dir: "utils/array-utils", reason: "no page change" }],
			valid: true,
		});
	});

	it("keeps warning, and says so, when the marker has no reason", async () => {
		const { client } = makeClient([
			{ status: 200, body: source() },
			pkgJson({ name: "p" }),
			{ status: 200, body: [commit("feat: x")] },
		]);

		expect(await run(client, { prBody: "[skip docs]" })).toMatchObject({
			missingReason: true,
			featWarnings: [{ dir: "utils/array-utils" }],
			valid: false,
		});
	});

	it("ignores the source of a private package", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("apps/sentinel/src/a.ts", "modified")] },
			pkgJson({ name: "sentinel", private: true }),
		]);

		expect(await run(client, { prTitle: "feat: x" })).toMatchObject({
			isFeat: false,
			featWarnings: [],
			valid: true,
		});
	});
});
