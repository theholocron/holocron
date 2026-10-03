import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it, vi } from "vitest";

import { validateRegistry } from "./validate-registry.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

function file(filename: string, status: "added" | "modified" | "removed" = "modified") {
	return { filename, status };
}

/** A `package.json` body, one field per line like a real one. */
function pkgJson(body: Record<string, unknown>) {
	return {
		status: 200,
		body: { content: Buffer.from(JSON.stringify(body, null, "\t")).toString("base64"), encoding: "base64" },
	};
}

const REGISTERED = new Set(["@theholocron/cli"]);

function run(
	client: ReturnType<typeof makeClient>["client"],
	loadRegistry = vi.fn(async () => ({ version: "1.14.0", packages: REGISTERED }))
) {
	return {
		promise: validateRegistry({ client, repo: "acme/demo", pullNumber: 9, ref: "pr-head", loadRegistry }),
		loadRegistry,
	};
}

describe("validateRegistry (holocron#925)", () => {
	it("passes a touched public package that's registered, reading package.json at the PR's ref", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: [file("packages/cli/package.json"), file("packages/cli/src/index.ts")] },
			pkgJson({ name: "@theholocron/cli", version: "1.0.0" }),
		]);

		const { promise } = run(client);

		expect(await promise).toEqual({
			checked: [{ name: "@theholocron/cli", file: "packages/cli/package.json", line: 2 }],
			missing: [],
			registryVersion: "1.14.0",
			valid: true,
		});
		expect(decodeURIComponent(calls[1]!.url)).toContain("/contents/packages/cli/package.json?ref=pr-head");
	});

	it("fails an unregistered public package, anchored on its name line", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("packages/widget/package.json", "added")] },
			pkgJson({ version: "0.0.1", name: "@theholocron/widget" }),
		]);

		const result = await run(client).promise;

		expect(result.valid).toBe(false);
		expect(result.missing).toEqual([
			{ name: "@theholocron/widget", file: "packages/widget/package.json", line: 3 },
		]);
	});

	it("never fetches the registry when the PR touches no public package.json", async () => {
		const { client, calls } = makeClient([
			{
				status: 200,
				body: [
					file("packages/internal/package.json"),
					file("packages/gone/package.json", "removed"),
					file("package.json"),
					file("packages/cli/nested/package.json"),
				],
			},
			pkgJson({ name: "internal", private: true }),
		]);

		const { promise, loadRegistry } = run(client);

		expect(await promise).toEqual({ checked: [], missing: [], valid: true });
		expect(loadRegistry).not.toHaveBeenCalled();
		expect(calls).toHaveLength(2);
	});

	it("skips a nameless package, a missing package.json (404) and one that isn't JSON, like the script", async () => {
		const { client } = makeClient([
			{
				status: 200,
				body: [
					file("packages/a/package.json"),
					file("packages/b/package.json"),
					file("packages/c/package.json"),
				],
			},
			pkgJson({ version: "1.0.0" }),
			{ status: 404, body: { message: "Not Found" } },
			{ status: 200, body: { content: Buffer.from("{not json").toString("base64"), encoding: "base64" } },
		]);

		expect((await run(client).promise).checked).toEqual([]);
	});

	it('falls back to line 1 when no "name" line can be found', async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("packages/w/package.json")] },
			{ status: 200, body: { content: Buffer.from('{"name":"@x/w"}').toString("base64"), encoding: "base64" } },
		]);

		expect((await run(client).promise).missing[0]?.line).toBe(1);
	});

	it("rethrows any other failure reading package.json", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("packages/a/package.json")] },
			{ status: 500, body: { message: "boom" } },
		]);

		const err = await run(client).promise.catch((e: unknown) => e);
		expect((err as { status?: number }).status).toBe(500);
	});
});
