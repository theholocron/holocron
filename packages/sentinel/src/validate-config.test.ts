import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { afterAll, describe, expect, it } from "vitest";

import { validateConfig } from "./validate-config.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

afterAll(async () => {
	await rm(join(packageRoot, ".tmp"), { recursive: true, force: true });
});

function b64(content: string): string {
	return Buffer.from(content, "utf8").toString("base64");
}

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

describe("validateConfig", () => {
	it("validates a plain-object holocron.config.json with only known task names", async () => {
		const { client } = makeClient([
			{ status: 404 }, // .ts
			{ status: 404 }, // .js
			{ status: 404 }, // .mjs
			{ status: 404 }, // .cjs
			{
				status: 200,
				body: {
					content: b64(JSON.stringify({ name: "demo", tasks: ["verification.unitTests", "delivery.build"] })),
				},
			},
		]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("valid");
		expect((result as { filepath: string }).filepath).toBe("holocron.config.json");
	});

	it("probes extensions in TS-first order, skipping 404s", async () => {
		const { client, calls } = makeClient([
			{ status: 404 }, // .ts
			{ status: 404 }, // .js
			{ status: 404 }, // .mjs
			{ status: 404 }, // .cjs
			{ status: 200, body: { content: b64(JSON.stringify({ name: "demo", tasks: [] })) } }, // .json
		]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("valid");
		expect((result as { filepath: string }).filepath).toBe("holocron.config.json");
		expect(calls.map((c) => c.url.split("/contents/")[1])).toEqual([
			"holocron.config.ts",
			"holocron.config.js",
			"holocron.config.mjs",
			"holocron.config.cjs",
			"holocron.config.json",
		]);
	});

	it("executes holocron.config.ts through defineConfig imported from @theholocron/cli, matching the README's documented pattern", async () => {
		const source = [
			'import { defineConfig } from "@theholocron/cli";',
			"export default defineConfig({",
			'  name: "demo",',
			'  tasks: ["verification.typeSafety"],',
			"});",
			"",
		].join("\n");
		const { client } = makeClient([{ status: 200, body: { content: b64(source) } }]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("valid");
		expect((result as { filepath: string }).filepath).toBe("holocron.config.ts");
	});

	it("reports unknown-tasks when tasks includes a name outside the registry", async () => {
		const { client } = makeClient([
			{ status: 404 },
			{ status: 404 },
			{ status: 404 },
			{ status: 404 },
			{ status: 200, body: { content: b64(JSON.stringify({ name: "demo", tasks: ["totally-made-up-task"] })) } },
		]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("unknown-tasks");
		expect((result as { unknownTasks: string[] }).unknownTasks).toEqual(["totally-made-up-task"]);
	});

	it("accepts object-form task entries, checking their name against the registry", async () => {
		const { client } = makeClient([
			{ status: 404 },
			{ status: 404 },
			{ status: 404 },
			{ status: 404 },
			{
				status: 200,
				body: {
					content: b64(
						JSON.stringify({
							name: "demo",
							tasks: [{ name: "verification.unitTests", ci: false }, "not-a-real-one"],
						})
					),
				},
			},
		]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("unknown-tasks");
		expect((result as { unknownTasks: string[] }).unknownTasks).toEqual(["not-a-real-one"]);
	});

	it("propagates a non-404 error from getContents instead of treating it as absent", async () => {
		const { client } = makeClient([{ status: 500, body: { message: "internal error" } }]);

		const err = await validateConfig({ client, repo: "acme/demo" }).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(Error);
	});

	it("treats a config with no tasks field at all as an empty, valid task list", async () => {
		const source = ["export default {", '  name: "demo",', "};", ""].join("\n");
		const { client } = makeClient([{ status: 200, body: { content: b64(source) } }]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("valid");
	});

	it("returns no-config when every extension 404s", async () => {
		const { client } = makeClient([
			{ status: 404 },
			{ status: 404 },
			{ status: 404 },
			{ status: 404 },
			{ status: 404 },
		]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("no-config");
	});

	it("returns load-error for a file that exists but isn't valid config content", async () => {
		const { client } = makeClient([{ status: 200, body: { content: b64("{ this is not json or js") } }]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("load-error");
		expect((result as { filepath: string }).filepath).toBe("holocron.config.ts");
	});

	it("never passes a ref, so it can only ever read the default branch (D4/D6)", async () => {
		const source = ["export default {", '  name: "demo",', "  tasks: [],", "};", ""].join("\n");
		const { client, calls } = makeClient([{ status: 200, body: { content: b64(source) } }]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("valid");
		expect(calls[0]?.url).not.toContain("ref=");
	});
});
