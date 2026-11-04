import { execFileSync } from "node:child_process";
import { mkdtempSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import type { FileIdentity } from "../../auth/index.js";
// The real opener would start a browser.
const openUrl = vi.hoisted(() => vi.fn());
vi.mock("../../ui/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../ui/index.js")>()),
	openPath: openUrl,
}));

import { runGithubAppCreate } from "./github-app-create.js";
import type { RunGithubAppCreateInput } from "./github-app-create.type.js";

const MANIFEST = JSON.stringify({ default_permissions: { contents: "write" }, default_events: ["push"] });
const PEM = "-----BEGIN RSA PRIVATE KEY-----\nAAAA\nBBBB\n-----END RSA PRIVATE KEY-----\n";
const APP = {
	id: 42,
	slug: "the-app-dev",
	htmlUrl: "https://github.com/apps/the-app-dev",
	pem: PEM,
	webhookSecret: "WHSECRET",
};

/** A real open descriptor, so the "leave the file" path has something to close. */
const identity = (): FileIdentity => {
	const fd = openSync(join(mkdtempSync(join(tmpdir(), "gha-")), "f"), "w");
	return { fd, dev: 1, ino: 1 } as FileIdentity;
};

function setup(over: Partial<RunGithubAppCreateInput> = {}) {
	const lines: string[] = [];
	const written: Array<{ path: string; text: string; force: boolean }> = [];
	const close = vi.fn();
	let page: ((redirect: string) => string) | undefined;
	const id = identity();
	const input: RunGithubAppCreateInput = {
		dir: "/repo",
		manifest: "apps/x/manifest.json",
		name: "The App - dev",
		webhookUrl: "https://t.example/api/webhook",
		readFile: () => MANIFEST,
		exists: () => false,
		isIgnored: () => "ignored",
		platform: "darwin",
		writeFile: (path, text, force) => {
			written.push({ path, text, force });
			return id;
		},
		serve: async (arg) => {
			page = arg.page;
			return { url: "http://127.0.0.1:9/", code: Promise.resolve("CODE"), close };
		},
		convert: async () => APP,
		openUrl: vi.fn(),
		state: "STATE",
		print: (line) => lines.push(line),
		logger: fakeLogger(),
		interactive: false,
		...over,
	};
	return { input, lines, written, close, page: () => page!, id };
}

describe("runGithubAppCreate", () => {
	it("creates the App and writes its id, key and webhook secret as dotenv lines, never printing a value", async () => {
		const { input, lines, written, close } = setup();
		const report = await runGithubAppCreate(input);
		expect(report).toEqual({ status: "ok", slug: "the-app-dev", appId: 42, file: "/repo/.credentials" });
		expect(written).toHaveLength(1);
		expect(written[0]!.path).toBe("/repo/.credentials");
		expect(written[0]!.force).toBe(false);
		expect(written[0]!.text).toBe(
			`GITHUB_APP_ID=42\nGITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\nAAAA\\nBBBB\\n-----END RSA PRIVATE KEY-----\\n"\nSENTINEL_WEBHOOK_SECRET=WHSECRET\n`
		);
		const said = lines.join("\n");
		for (const secret of ["AAAA", "WHSECRET"]) expect(said).not.toContain(secret);
		expect(said).toContain("created the-app-dev (App id 42)");
		expect(said).toContain("https://github.com/apps/the-app-dev/installations/new");
		// Not interactive: the file stays and the command says to delete it.
		expect(said).toContain("delete it when you are done: /repo/.credentials");
		expect(close).toHaveBeenCalledTimes(1);
		expect(input.openUrl).toHaveBeenCalledWith("http://127.0.0.1:9/");
	});

	it("posts the manifest to the organization's page, and to the account's when there is no org", async () => {
		const withOrg = setup({ org: "theholocron" });
		await runGithubAppCreate(withOrg.input);
		const html = withOrg.page()("http://127.0.0.1:9/callback");
		expect(html).toContain("https://github.com/organizations/theholocron/settings/apps/new?state=STATE");
		expect(html).toContain("&quot;redirect_url&quot;:&quot;http://127.0.0.1:9/callback&quot;");

		const noOrg = setup();
		await runGithubAppCreate(noOrg.input);
		expect(noOrg.page()("http://127.0.0.1:9/callback")).toContain(
			'action="https://github.com/settings/apps/new?state=STATE"'
		);
	});

	it("names the webhook secret as asked, writes to the file asked and replaces it with --force", async () => {
		const { input, written } = setup({ webhookSecretVar: "WH", file: "dev.env", force: true });
		await runGithubAppCreate(input);
		expect(written[0]!.path).toBe("/repo/dev.env");
		expect(written[0]!.force).toBe(true);
		expect(written[0]!.text).toContain("\nWH=WHSECRET\n");
	});

	it("deletes the file once the import is done, on a terminal", async () => {
		const shred = vi.fn(() => "deleted" as const);
		const waitForImport = vi.fn(async () => {});
		const { input, lines } = setup({ interactive: true, shred, waitForImport });
		expect((await runGithubAppCreate(input)).status).toBe("ok");
		expect(waitForImport).toHaveBeenCalledTimes(1);
		expect(shred).toHaveBeenCalledTimes(1);
		expect(lines).toContain("deleted /repo/.credentials");
	});

	it("fails when the file could not be deleted: secrets are still on disk", async () => {
		const shred = vi.fn(() => {
			throw new Error("busy");
		});
		const { input } = setup({ interactive: true, shred, waitForImport: async () => {} });
		expect((await runGithubAppCreate(input)).status).toBe("fail");
	});

	it.each([
		["Windows", { platform: "win32" }, /Windows/],
		[
			"a manifest that cannot be read",
			{
				readFile: () => {
					throw new Error("ENOENT");
				},
			},
			/could not read the manifest/,
		],
		["a manifest that is not JSON", { readFile: () => "{" }, /could not read the manifest/],
		["a manifest with no permissions", { readFile: () => "{}" }, /default_permissions/],
		["a webhook that is not https", { webhookUrl: "http://t.example" }, /must be https/],
	])("refuses %s before opening a browser", async (_label, over, message) => {
		const { input, lines } = setup(over as Partial<RunGithubAppCreateInput>);
		const serve = vi.fn();
		const report = await runGithubAppCreate({ ...input, serve });
		expect(report).toEqual({ status: "fail" });
		expect(lines.join("\n")).toMatch(message);
		expect(serve).not.toHaveBeenCalled();
	});

	it.each([
		["tracked", /does not ignore it/],
		["unknown", /could not say/],
	] as const)("refuses a file git says is %s", async (git, message) => {
		const { input, lines } = setup({ isIgnored: () => git });
		expect((await runGithubAppCreate(input)).status).toBe("fail");
		expect(lines.join("\n")).toMatch(message);
	});

	it("never overwrites a file that is there, unless told to", async () => {
		const { input, lines } = setup({ exists: () => true });
		expect((await runGithubAppCreate(input)).status).toBe("fail");
		expect(lines.join("\n")).toContain("never overwritten");
		const forced = setup({ exists: () => true, force: true });
		expect((await runGithubAppCreate(forced.input)).status).toBe("ok");
	});

	it("says the App was not created when GitHub never answers, and stops the server", async () => {
		const closing = vi.fn();
		const { input, lines } = setup({
			serve: async () => ({ url: "u", code: Promise.reject(new Error("timed out")), close: closing }),
		});
		expect(await runGithubAppCreate(input)).toEqual({ status: "fail" });
		expect(lines.join("\n")).toContain("the App was not created: timed out");
		expect(closing).toHaveBeenCalledTimes(1);
	});

	it("says the App was not created when the code cannot be exchanged", async () => {
		const { input, lines } = setup({
			convert: async () => {
				throw new Error("HTTP 404");
			},
		});
		expect((await runGithubAppCreate(input)).status).toBe("fail");
		expect(lines.join("\n")).toContain("the App was not created: HTTP 404");
	});

	it("says where to delete the App when its credentials could not be kept", async () => {
		const { input, lines } = setup({
			org: "theholocron",
			writeFile: () => {
				throw new Error("disk full");
			},
		});
		const report = await runGithubAppCreate(input);
		expect(report).toEqual({ status: "fail", slug: "the-app-dev", appId: 42 });
		const said = lines.join("\n");
		expect(said).toContain("could not keep its credentials: disk full");
		expect(said).toContain("https://github.com/organizations/theholocron/settings/apps/the-app-dev/advanced");
		expect(said).not.toContain("WHSECRET");
	});

	it("points at the account's settings for an App it created there", async () => {
		const { input, lines } = setup({
			writeFile: () => {
				throw new Error("disk full");
			},
		});
		await runGithubAppCreate(input);
		expect(lines.join("\n")).toContain("https://github.com/settings/apps/the-app-dev/advanced");
	});

	it("fails to keep a value no dotenv line can carry", async () => {
		const { input, lines } = setup({ convert: async () => ({ ...APP, webhookSecret: `a"b'c\`d` }) });
		expect((await runGithubAppCreate(input)).status).toBe("fail");
		expect(lines.join("\n")).toContain("cannot be written as a dotenv line");
	});

	it("makes a random state when none is given", async () => {
		let seen: string | undefined;
		const { input } = setup({
			state: undefined,
			serve: async (arg) => {
				seen = arg.state;
				return { url: "u", code: Promise.resolve("c"), close: vi.fn() };
			},
		});
		await runGithubAppCreate(input);
		expect(seen).toMatch(/^[0-9a-f]{32}$/);
	});
});

describe("runGithubAppCreate end to end", () => {
	it("runs with the real file, git, server and writer, and only GitHub and the browser stubbed", async () => {
		const dir = mkdtempSync(join(tmpdir(), "gha-e2e-"));
		execFileSync("git", ["init", "-q"], { cwd: dir });
		writeFileSync(join(dir, ".gitignore"), ".credentials\n");
		writeFileSync(join(dir, "manifest.json"), MANIFEST);

		const real = globalThis.fetch;
		const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) =>
			String(url).startsWith("https://api.github.com/")
				? new Response(
						JSON.stringify({
							id: 7,
							slug: "e2e",
							html_url: "https://github.com/apps/e2e",
							pem: PEM,
							webhook_secret: "W",
						}),
						{ status: 201 }
					)
				: real(url, init)
		);
		// The "browser": load the page, then do what GitHub does after "Create": redirect to the callback with the state.
		openUrl.mockImplementation((url: string) => {
			void (async () => {
				const page = await (await real(url)).text();
				const state = /state=([0-9a-f]+)/.exec(page)![1];
				await real(`${url}callback?code=C&state=${state}`);
			})();
		});
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const report = await runGithubAppCreate({
				dir,
				manifest: "manifest.json",
				name: "E2E",
				webhookUrl: "https://t.example/hook",
			});
			expect(report).toMatchObject({ status: "ok", slug: "e2e", appId: 7 });
			const text = readFileSync(join(dir, ".credentials"), "utf8");
			expect(text).toContain("GITHUB_APP_ID=7\n");
			expect(text).toContain("SENTINEL_WEBHOOK_SECRET=W\n");
			expect(statSync(join(dir, ".credentials")).mode & 0o777).toBe(0o600);
		} finally {
			spy.mockRestore();
			err.mockRestore();
		}
	});
});
