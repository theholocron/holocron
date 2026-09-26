import { readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { afterAll, describe, expect, it } from "vitest";

import { validateConfig } from "./validate-config.js";

afterAll(async () => {
	const entries = await readdir(tmpdir());
	await Promise.all(
		entries
			.filter((name) => name.startsWith("sentinel-validate-"))
			.map((name) => rm(join(tmpdir(), name), { recursive: true, force: true }))
	);
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

	it("forwards a given ref to every getContents() probe, instead of the default branch (holocron#820)", async () => {
		const { client, calls } = makeClient([
			{ status: 404 }, // .ts
			{ status: 404 }, // .js
			{ status: 404 }, // .mjs
			{ status: 404 }, // .cjs
			{ status: 200, body: { content: b64(JSON.stringify({ name: "demo", tasks: [] })) } }, // .json
		]);

		const result = await validateConfig({ client, repo: "acme/demo", ref: "pr-head-sha" });

		expect(result.status).toBe("valid");
		expect(calls.every((c) => c.url.includes("ref=pr-head-sha"))).toBe(true);
	});

	it("omits ref (falls back to the default branch) when none is given", async () => {
		const { client, calls } = makeClient([
			{ status: 404 }, // .ts
			{ status: 404 }, // .js
			{ status: 404 }, // .mjs
			{ status: 404 }, // .cjs
			{ status: 200, body: { content: b64(JSON.stringify({ name: "demo", tasks: [] })) } }, // .json
		]);

		await validateConfig({ client, repo: "acme/demo" });

		expect(calls.every((c) => !c.url.includes("ref="))).toBe(true);
	});

	// Real work, not a mock: writes the fetched source to a temp file and
	// dynamically import()s it, which lazily registers tsx's ESM loader the
	// first time a .ts config is loaded in this process (datapad's load.ts).
	// The default 5000ms testTimeout is consistently too tight on CI's
	// shared runners specifically (never seen locally) — found live,
	// holocron#814, 3 flaky failures in a row, always ~5-6s.
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
	}, 15000);

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

	it("accepts KNOWN_WORKFLOWS-only entries (community-health automations with no local runner) as valid, not unknown-tasks", async () => {
		// Found live against theholocron/clients's real config: "stale"/"greetings"/
		// "bookkeeping"/"dependencies"/"review" are legitimate thinCallers()
		// entries (real generated workflows) but were never in KNOWN_TASKS,
		// which only covers runnable astromech tasks.
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
							tasks: ["stale", "greetings", "bookkeeping", "dependencies", "review"],
						})
					),
				},
			},
		]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("valid");
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

	it("resolves @theholocron/holocron-config's shared presets, matching a real repo's config shape", async () => {
		// Found live: the very first real log line to reach Axiom after
		// holocron#780 shipped was theholocron/react-template's Capability
		// Compliance check failing with "Cannot find package
		// '@theholocron/holocron-config'" -- this package was never a
		// dependency of packages/sentinel itself, so it was never installed
		// into the symlinked node_modules validateConfig() resolves through.
		// react-template's own config (compose/react/wiki, mirrored below) was
		// always valid; the gap was entirely on this side (holocron#782).
		//
		// Deliberately overrides `tasks` rather than spreading `...preset.tasks`:
		// @theholocron/holocron-config@8.4.5's react() preset still emits
		// pre-decomposition task names ("lint", "test", "typecheck") that
		// astromech's KNOWN_TASKS no longer recognizes -- a real, separate gap
		// in that package (unrelated to module resolution, not this test's
		// concern). Proving the import itself resolves is the point here; a
		// `load-error` mentioning "Cannot find package" is exactly what this
		// regresses to without holocron#782's fix.
		const source = [
			'import { defineConfig } from "@theholocron/cli";',
			'import { compose, react, wikiCapability as wiki } from "@theholocron/holocron-config";',
			"",
			"const preset = compose(react({}), wiki());",
			"export default defineConfig({",
			"  ...preset,",
			'  name: "demo",',
			'  tasks: ["verification.typeSafety"],',
			"});",
			"",
		].join("\n");
		const { client } = makeClient([{ status: 200, body: { content: b64(source) } }]);

		const result = await validateConfig({ client, repo: "theholocron/react-template" });

		expect(result.status).toBe("valid");
	});

	it("never passes a ref, so it can only ever read the default branch (D4/D6)", async () => {
		const source = ["export default {", '  name: "demo",', "  tasks: [],", "};", ""].join("\n");
		const { client, calls } = makeClient([{ status: 200, body: { content: b64(source) } }]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("valid");
		expect(calls[0]?.url).not.toContain("ref=");
	});
});
