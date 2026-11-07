import { readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { afterAll, describe, expect, it } from "vitest";

import { MAX_CONFIG_DIR_BYTES, MAX_CONFIG_DIR_FILE_BYTES, MAX_CONFIG_DIR_FILES } from "../fetch-config-dir/index.js";
import { validateConfig } from "./validate-config.js";

// The `.holocron/` directory beside the config (#1785): listed, fetched within caps, written to the sandbox, and its
// area files placed on the config.

afterAll(async () => {
	const entries = await readdir(tmpdir());
	await Promise.all(
		entries
			.filter((name) => name.startsWith("sentinel-validate-"))
			.map((name) => rm(join(tmpdir(), name), { recursive: true, force: true }))
	);
});

const b64 = (content: string): string => Buffer.from(content, "utf8").toString("base64");

/** One `.holocron/` file: its listing entry and, for the fetch that follows, its contents. */
interface TreeFile {
	name: string;
	content: string;
	/** Overrides the size the listing reports (a cap is checked against it before anything is fetched). */
	size?: number;
	type?: "file" | "symlink" | "submodule";
}

const listing = (files: TreeFile[]) => ({
	status: 200,
	body: files.map((f) => ({
		name: f.name,
		path: `.holocron/${f.name}`,
		type: f.type ?? "file",
		size: f.size ?? f.content.length,
		sha: "abc",
	})),
});

/**
 * holocron.config.ts at once (the first probe), the `.holocron/` listing, a fetch per plain file, and no
 * astromech.config.*.
 */
function makeClient(config: string, files: TreeFile[] | "absent") {
	const fetched =
		files === "absent"
			? []
			: files.filter((f) => (f.type ?? "file") === "file" && !/\.(png|jpe?g|gif)$/.test(f.name));
	const { fetch, calls } = stubFetch([
		{ status: 200, body: { content: b64(config) } },
		files === "absent" ? { status: 404 } : listing(files),
		...fetched.map((f) => ({ status: 200, body: { content: b64(f.content) } })),
		...Array.from({ length: 5 }, () => ({ status: 404 })),
	]);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

/** The config of a `valid` result; fails the test (with the status) otherwise. */
function validConfig(result: Awaited<ReturnType<typeof validateConfig>>): Record<string, unknown> {
	if (result.status !== "valid") throw new Error(`expected a valid config, got ${result.status}`);
	return result.config as Record<string, unknown>;
}

const WITH_DISCORD = [
	"export default {",
	'  name: "demo",',
	"  tasks: [],",
	'  providers: { notifications: ["discord", { guildId: "1" }] },',
	"};",
	"",
].join("\n");

describe("validateConfig with a .holocron/ directory", () => {
	it("is unchanged for a repo without .holocron/ (the listing 404s)", async () => {
		const { client, calls } = makeClient(WITH_DISCORD, "absent");

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("valid");
		expect(validConfig(result).providers).toEqual({
			notifications: ["discord", { guildId: "1" }],
		});
		expect(calls[1]?.url).toContain("/contents/.holocron");
	});

	it("treats an empty .holocron/ like an absent one", async () => {
		const { client } = makeClient(WITH_DISCORD, []);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("valid");
	});

	it("places notifications.ts as the layout of the notifications provider", async () => {
		const { client } = makeClient(WITH_DISCORD, [
			{ name: "notifications.ts", content: 'export default { roles: ["maintainers"] };\n' },
		]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("valid");
		expect(validConfig(result).providers).toEqual({
			notifications: ["discord", { guildId: "1", layout: { roles: ["maintainers"] } }],
		});
	});

	it("places repo.ts into the repo block", async () => {
		const config = 'export default { name: "demo", tasks: [] };\n';
		const { client } = makeClient(config, [
			{ name: "repo.ts", content: 'export default { description: "from a file" };\n' },
		]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("valid");
		expect(validConfig(result).repo).toEqual({ description: "from a file" });
	});

	it("lets an area file import a sibling, and never evaluates a file nothing imports", async () => {
		const { client } = makeClient(WITH_DISCORD, [
			{ name: "channels.ts", content: 'export const roles = ["from-sibling"];\n' },
			{
				name: "notifications.ts",
				content: 'import { roles } from "./channels.js";\nexport default { roles };\n',
			},
			// Would throw if it were ever evaluated.
			{ name: "stray.ts", content: 'throw new Error("stray file was evaluated");\n' },
		]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("valid");
		expect(validConfig(result).providers).toMatchObject({
			notifications: ["discord", { layout: { roles: ["from-sibling"] } }],
		});
	});

	it("lets the config itself import from .holocron/", async () => {
		const config = [
			'import { tasks } from "./.holocron/shared.js";',
			'export default { name: "demo", tasks };',
			"",
		].join("\n");
		const { client } = makeClient(config, [
			{ name: "shared.ts", content: 'export const tasks = ["verification.typeSafety"];\n' },
		]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("valid");
		expect(validConfig(result).tasks).toEqual(["verification.typeSafety"]);
	});

	it("lists and fetches the tree at the ref the config was read at", async () => {
		const { client, calls } = makeClient(WITH_DISCORD, [
			{ name: "notifications.ts", content: "export default {};\n" },
		]);

		await validateConfig({ client, repo: "acme/demo", ref: "pr-head-sha" });

		expect(calls.length).toBeGreaterThanOrEqual(3);
		expect(calls.slice(0, 3).every((c) => c.url.includes("ref=pr-head-sha"))).toBe(true);
	});

	it("skips symlinks and submodules (nothing is fetched for them)", async () => {
		const { client, calls } = makeClient(WITH_DISCORD, [
			{ name: "link.ts", content: "x", type: "symlink" },
			{ name: "sub", content: "", type: "submodule" },
			{ name: "notifications.ts", content: "export default { a: 1 };\n" },
		]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("valid");
		expect(calls.map((c) => c.url).filter((u) => u.includes("link.ts") || u.includes("sub"))).toEqual([]);
	});

	it("reports an area file that does not load as a load-error", async () => {
		const { client } = makeClient(WITH_DISCORD, [{ name: "notifications.ts", content: "export default {{{ nope" }]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("load-error");
		expect((result as { filepath: string }).filepath).toBe("holocron.config.ts");
		expect((result as { message: string }).message).toContain("notifications");
	});

	it("reports a layout set both inline and in the file as a load-error", async () => {
		const config = [
			"export default {",
			'  name: "demo", tasks: [],',
			'  providers: { notifications: ["discord", { guildId: "1", layout: { inline: true } }] },',
			"};",
			"",
		].join("\n");
		const { client } = makeClient(config, [{ name: "notifications.ts", content: "export default { a: 1 };\n" }]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("load-error");
		expect((result as { message: string }).message).toContain(".holocron/notifications.ts");
	});

	it("propagates a non-404 failure listing .holocron/ instead of reading it as absent", async () => {
		const { fetch } = stubFetch([
			{ status: 200, body: { content: b64(WITH_DISCORD) } },
			{ status: 500, body: { message: "boom" } },
		]);
		const client = createGitHubClient({ token: "ghp_test", fetch });

		const err = await validateConfig({ client, repo: "acme/demo" }).catch((e: unknown) => e);

		expect((err as { status?: number }).status).toBe(500);
	});

	it("leaves a picture out: an avatar over the per-file cap neither fails the check nor is fetched", async () => {
		const { client, calls } = makeClient(WITH_DISCORD, [
			{ name: "notifications.ts", content: "export default {};\n" },
			{ name: "media/webhook-avatar.png", content: "png", size: MAX_CONFIG_DIR_FILE_BYTES * 4 },
		]);

		const result = await validateConfig({ client, repo: "acme/demo" });

		expect(result.status).toBe("valid");
		expect(calls.some((call) => call.url.includes("webhook-avatar.png"))).toBe(false);
	});

	describe("caps", () => {
		it("rejects a file over the per-file cap, before fetching any file", async () => {
			const { client, calls } = makeClient(WITH_DISCORD, [
				{ name: "notifications.ts", content: "export default {};\n" },
				{ name: "big.ts", content: "x", size: MAX_CONFIG_DIR_FILE_BYTES + 1 },
			]);

			const result = await validateConfig({ client, repo: "acme/demo" });

			expect(result.status).toBe("load-error");
			expect((result as { message: string }).message).toContain(".holocron/big.ts is larger than 100 KB");
			expect(calls).toHaveLength(2); // config + listing only
		});

		it("accepts a file exactly at the per-file cap", async () => {
			const { client } = makeClient(WITH_DISCORD, [
				{ name: "notifications.ts", content: "export default {};\n", size: MAX_CONFIG_DIR_FILE_BYTES },
			]);

			const result = await validateConfig({ client, repo: "acme/demo" });

			expect(result.status).toBe("valid");
		});

		it("rejects a tree with more files than the file-count cap", async () => {
			const files = Array.from({ length: MAX_CONFIG_DIR_FILES + 1 }, (_, i) => ({
				name: `f${i}.ts`,
				content: "export {};\n",
			}));
			const { client } = makeClient(WITH_DISCORD, files);

			const result = await validateConfig({ client, repo: "acme/demo" });

			expect(result.status).toBe("load-error");
			expect((result as { message: string }).message).toContain(`has ${files.length} files`);
		});

		it("rejects a tree over the total size cap even when every file is under the per-file cap", async () => {
			const each = MAX_CONFIG_DIR_FILE_BYTES;
			const count = Math.floor(MAX_CONFIG_DIR_BYTES / each) + 1;
			const files = Array.from({ length: count }, (_, i) => ({ name: `f${i}.ts`, content: "x", size: each }));
			const { client } = makeClient(WITH_DISCORD, files);

			const result = await validateConfig({ client, repo: "acme/demo" });

			expect(result.status).toBe("load-error");
			expect((result as { message: string }).message).toContain("in all");
		});
	});
});
