import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MAX_REPO_TEXT_BYTES, readRepoText } from "./read-repo-text.js";

describe("readRepoText", () => {
	let base: string;
	let root: string;

	beforeEach(async () => {
		base = await mkdtemp(join(tmpdir(), "read-repo-text-"));
		root = join(base, "repo");
		await mkdir(join(root, "docs"), { recursive: true });
	});

	afterEach(async () => {
		await rm(base, { recursive: true, force: true });
	});

	const failure = async (file: string): Promise<string> => {
		const err = await readRepoText(root, file).catch((e: unknown) => e);
		return (err as Error).message;
	};

	it("reads a file at the root and one in a folder", async () => {
		await writeFile(join(root, "RULES.md"), "be kind\n");
		await writeFile(join(root, "docs", "welcome.md"), "hello");

		expect(await readRepoText(root, "RULES.md")).toBe("be kind\n");
		expect(await readRepoText(root, "docs/welcome.md")).toBe("hello");
	});

	it("refuses an absolute path", async () => {
		expect(await failure(join(root, "RULES.md"))).toMatch(/not an absolute one/);
	});

	it("refuses a path that climbs out of the repository, even to a file that exists", async () => {
		await writeFile(join(base, "secret.txt"), "no");

		expect(await failure("../secret.txt")).toMatch(/outside the repository/);
		expect(await failure("..")).toMatch(/outside the repository/);
	});

	it("refuses a link that leads outside the repository", async () => {
		await writeFile(join(base, "secret.txt"), "no");
		await symlink(join(base, "secret.txt"), join(root, "RULES.md"));

		expect(await failure("RULES.md")).toMatch(/outside the repository/);
	});

	it("follows a link that stays inside", async () => {
		await writeFile(join(root, "docs", "real.md"), "inside");
		await symlink(join(root, "docs", "real.md"), join(root, "RULES.md"));

		expect(await readRepoText(root, "RULES.md")).toBe("inside");
	});

	it("allows a file whose name starts with two dots", async () => {
		await writeFile(join(root, "..notes.md"), "ok");

		expect(await readRepoText(root, "..notes.md")).toBe("ok");
	});

	it("refuses a directory", async () => {
		expect(await failure("docs")).toMatch(/not a file/);
	});

	it("refuses a file over the size cap and reads one at the cap", async () => {
		await writeFile(join(root, "big.md"), "x".repeat(MAX_REPO_TEXT_BYTES + 1));
		await writeFile(join(root, "edge.md"), "x".repeat(MAX_REPO_TEXT_BYTES));

		expect(await failure("big.md")).toMatch(/larger than 100 KB/);
		expect((await readRepoText(root, "edge.md")).length).toBe(MAX_REPO_TEXT_BYTES);
	});

	it("passes a missing file's error through for the caller to explain", async () => {
		const err = (await readRepoText(root, "NOPE.md").catch((e: unknown) => e)) as NodeJS.ErrnoException;

		expect(err.code).toBe("ENOENT");
	});
});
