import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { isDocsFile, validateDocsPresence } from "./validate-docs-presence.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

function file(filename: string, status: "added" | "modified" | "removed" = "added") {
	return { filename, status };
}

function pkgJson(body: Record<string, unknown>) {
	return {
		status: 200,
		body: { content: Buffer.from(JSON.stringify(body)).toString("base64"), encoding: "base64" },
	};
}

const run = (client: ReturnType<typeof makeClient>["client"]) =>
	validateDocsPresence({ client, repo: "acme/demo", pullNumber: 9, ref: "pr-head" });

describe("isDocsFile — the script's own definition of a docs change", () => {
	it("counts anything under docs/ and any .md/.mdx file", () => {
		expect(isDocsFile("docs/src/content/x.ts")).toBe(true);
		expect(isDocsFile("packages/x/README.md")).toBe(true);
		expect(isDocsFile("site/page.mdx")).toBe(true);
		expect(isDocsFile("packages/x/src/index.ts")).toBe(false);
	});
});

describe("validateDocsPresence", () => {
	it("is valid when the PR adds no package entry point, without reading any package.json", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: [file("packages/cli/src/index.ts", "modified"), file("packages/cli/src/new.ts")] },
		]);

		expect(await run(client)).toEqual({ newPackages: [], hasDocsChange: false, valid: true });
		expect(calls).toHaveLength(1);
	});

	it("flags a new public package added without any docs change", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: [file("packages/widget/src/index.ts"), file("packages/widget/package.json")] },
			pkgJson({ name: "@acme/widget" }),
		]);

		expect(await run(client)).toEqual({
			newPackages: [{ name: "widget", entry: "packages/widget/src/index.ts" }],
			hasDocsChange: false,
			valid: false,
		});
		expect(decodeURIComponent(calls[1]!.url)).toContain("/contents/packages/widget/package.json?ref=pr-head");
	});

	it("passes a new public package that comes with a docs change", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("packages/widget/src/index.ts"), file("packages/widget/README.md")] },
			pkgJson({ name: "@acme/widget" }),
		]);

		expect(await run(client)).toMatchObject({ hasDocsChange: true, valid: true });
	});

	it("ignores private packages", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("packages/internal/src/index.ts")] },
			pkgJson({ name: "internal", private: true }),
		]);

		expect(await run(client)).toEqual({ newPackages: [], hasDocsChange: false, valid: true });
	});

	it("skips a package whose package.json is missing (404) or isn't JSON, like the script", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("packages/a/src/index.ts"), file("packages/b/src/index.ts")] },
			{ status: 404, body: { message: "Not Found" } },
			{ status: 200, body: { content: Buffer.from("{not json").toString("base64"), encoding: "base64" } },
		]);

		expect(await run(client)).toEqual({ newPackages: [], hasDocsChange: false, valid: true });
	});

	it("rethrows any other failure reading package.json -- a real error, not a skip", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("packages/a/src/index.ts")] },
			{ status: 500, body: { message: "boom" } },
		]);

		const err = await run(client).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as { status?: number }).status).toBe(500);
	});
});
