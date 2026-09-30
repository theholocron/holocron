import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { lintStaticAnalysis } from "./lint-static-analysis.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

function file(filename: string, status: "added" | "modified" | "removed" = "modified") {
	return { filename, status };
}

function contentsBody(text: string) {
	return {
		content: Buffer.from(text, "utf8").toString("base64"),
		encoding: "base64",
		sha: "x",
		name: "x",
		path: "x",
	};
}

describe("lintStaticAnalysis — a clean file", () => {
	it("fetches the PR's changed files, reads the PR ref's content, and reports valid", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("export const x = 1;\n") },
		]);

		const result = await lintStaticAnalysis({ client, repo: "acme/demo", pullNumber: 42, ref: "pr-head-sha" });

		expect(calls[0]?.url).toContain("/repos/acme/demo/pulls/42/files");
		expect(calls[1]?.url).toContain("/repos/acme/demo/contents/src/index.ts");
		expect(calls[1]?.url).toContain("ref=pr-head-sha");
		expect(result).toEqual({ valid: true, fileCount: 1, messages: [] });
	});
});

describe("lintStaticAnalysis — a file with real findings", () => {
	it("catches a genuine eslint violation (unused var, real @typescript-eslint/no-unused-vars rule)", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("const unused = 1;\nexport const x = 2;\n") },
		]);

		const result = await lintStaticAnalysis({ client, repo: "acme/demo", pullNumber: 7, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.fileCount).toBe(1);
		expect(result.messages[0]?.file).toBe("src/index.ts");
		expect(result.messages[0]?.ruleId).toBe("@typescript-eslint/no-unused-vars");
		expect(result.messages[0]?.severity).toBe("error");
	});

	it("doesn't crash on an unresolvable import — no checkout, no real filesystem to resolve against", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("src/index.ts")] },
			{
				status: 200,
				body: contentsBody('import { thing } from "./does-not-exist.js";\nexport const x = thing;\n'),
			},
		]);

		const result = await lintStaticAnalysis({ client, repo: "acme/demo", pullNumber: 7, ref: "sha" });

		expect(result.valid).toBe(true);
	});

	it('reports a warning-severity finding as "warning", not "error" (vitest/no-disabled-tests)', async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("src/__tests__/foo.test.ts")] },
			{ status: 200, body: contentsBody('import { it } from "vitest";\nit.skip("a", () => {});\n') },
		]);

		const result = await lintStaticAnalysis({ client, repo: "acme/demo", pullNumber: 7, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages[0]?.ruleId).toBe("vitest/no-disabled-tests");
		expect(result.messages[0]?.severity).toBe("warning");
	});
});

describe("lintStaticAnalysis — browserPackages (holocron#858)", () => {
	const webCryptoSource =
		'export async function sign() { return crypto.subtle.digest("SHA-256", new Uint8Array()); }\n';

	it("flags Web Crypto global usage as a node-builtins finding when browserPackages is absent", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("src/app-auth/sign.ts")] },
			{ status: 200, body: contentsBody(webCryptoSource) },
		]);

		const result = await lintStaticAnalysis({ client, repo: "acme/demo", pullNumber: 7, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages[0]?.ruleId).toBe("n/no-unsupported-features/node-builtins");
	});

	it("suppresses that same finding when the file's directory is listed in browserPackages", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("src/app-auth/sign.ts")] },
			{ status: 200, body: contentsBody(webCryptoSource) },
		]);

		const result = await lintStaticAnalysis({
			client,
			repo: "acme/demo",
			pullNumber: 7,
			ref: "sha",
			browserPackages: ["src/app-auth"],
		});

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [] });
	});

	it("an empty browserPackages array behaves the same as omitting it", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("src/app-auth/sign.ts")] },
			{ status: 200, body: contentsBody(webCryptoSource) },
		]);

		const result = await lintStaticAnalysis({
			client,
			repo: "acme/demo",
			pullNumber: 7,
			ref: "sha",
			browserPackages: [],
		});

		expect(result.valid).toBe(false);
	});
});

describe("lintStaticAnalysis — scoping", () => {
	it("skips a non-lintable file entirely, without fetching its content", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("README.md")] }]);

		const result = await lintStaticAnalysis({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
		expect(calls).toHaveLength(1);
	});

	it("skips a removed file even if it would otherwise be checked", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("src/deleted.ts", "removed")] }]);

		const result = await lintStaticAnalysis({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
		expect(calls).toHaveLength(1);
	});

	it("checks a .tsx file too, not just .ts", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("src/component.tsx")] },
			{ status: 200, body: contentsBody("export const x = 1;\n") },
		]);

		const result = await lintStaticAnalysis({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [] });
	});
});

describe("lintStaticAnalysis — multiple files", () => {
	it("attributes findings to the correct file when multiple files are linted", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("a.ts"), file("b.ts")] },
			{ status: 200, body: contentsBody("export const clean = 1;\n") },
			{ status: 200, body: contentsBody("const unused = 1;\nexport const x = 2;\n") },
		]);

		const result = await lintStaticAnalysis({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.fileCount).toBe(2);
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0]?.file).toBe("b.ts");
	});
});
