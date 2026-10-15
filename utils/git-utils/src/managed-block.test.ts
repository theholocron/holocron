import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { updateGitignore, upsertManagedBlock } from "./managed-block.ts";

const opts = { start: "# managed: skills", end: "# end managed: skills", lines: ["/.agents/", "/.claude/skills/a"] };
const block = "# managed: skills\n/.agents/\n/.claude/skills/a\n# end managed: skills";

describe("upsertManagedBlock", () => {
	it("creates the block in an empty file with one trailing newline", () => {
		expect(upsertManagedBlock("", opts)).toBe(`${block}\n`);
	});

	it("appends after existing content, separated by a blank line", () => {
		expect(upsertManagedBlock("node_modules\ndist\n", opts)).toBe(`node_modules\ndist\n\n${block}\n`);
		expect(upsertManagedBlock("node_modules", opts)).toBe(`node_modules\n\n${block}\n`);
	});

	it("collapses trailing blank lines before appending", () => {
		expect(upsertManagedBlock("a\n\n\n", opts)).toBe(`a\n\n${block}\n`);
	});

	it("replaces an existing block in place, keeping what is above and below", () => {
		const before = "top\n\n# managed: skills\n/old\n# end managed: skills\n\nbottom\n";
		expect(upsertManagedBlock(before, opts)).toBe(`top\n\n${block}\n\nbottom\n`);
	});

	it("is idempotent", () => {
		const once = upsertManagedBlock("node_modules\n", opts);
		expect(upsertManagedBlock(once, opts)).toBe(once);
	});

	it("can empty a block's lines", () => {
		const out = upsertManagedBlock(`${block}\n`, { ...opts, lines: [] });
		expect(out).toBe("# managed: skills\n# end managed: skills\n");
	});

	it("start present, end missing: replaces to the next blank line and keeps what follows", () => {
		const before = "top\n\n# managed: skills\n/stale\n\nkeep-me\nand-me\n";
		expect(upsertManagedBlock(before, opts)).toBe(`top\n\n${block}\n\nkeep-me\nand-me\n`);
	});

	it("start present, end missing, block runs to the end of the file", () => {
		expect(upsertManagedBlock("top\n# managed: skills\n/stale\n", opts)).toBe(`top\n${block}\n`);
	});

	it("never matches the end marker before the start marker", () => {
		const before = "# end managed: skills\nx\n# managed: skills\n/old\n# end managed: skills\n";
		expect(upsertManagedBlock(before, opts)).toBe(`# end managed: skills\nx\n${block}\n`);
	});
});

describe("upsertManagedBlock edge cases", () => {
	const crlfBlock = block.replace(/\n/g, "\r\n");

	it("keeps a CRLF file CRLF, and is idempotent on it", () => {
		const once = upsertManagedBlock("node_modules\r\ndist\r\n", opts);
		expect(once).toBe(`node_modules\r\ndist\r\n\r\n${crlfBlock}\r\n`);
		expect(upsertManagedBlock(once, opts)).toBe(once);
	});

	it("CRLF, end missing: stops at the CRLF blank line and keeps what follows", () => {
		const before = "top\r\n\r\n# managed: skills\r\n/stale\r\n\r\nkeep-me\r\n";
		expect(upsertManagedBlock(before, opts)).toBe(`top\r\n\r\n${crlfBlock}\r\n\r\nkeep-me\r\n`);
	});

	it("treats a whitespace-only line as the blank-line boundary", () => {
		const before = "# managed: skills\n/stale\n  \t\nkeep-me\n";
		expect(upsertManagedBlock(before, opts)).toBe(`${block}\n  \t\nkeep-me\n`);
	});

	it("an end marker past the blank-line boundary doesn't close the block or eat what's between", () => {
		const before = "# managed: skills\n/stale\n\nuser-rule\n# end managed: skills\ntail\n";
		expect(upsertManagedBlock(before, opts)).toBe(`${block}\n\nuser-rule\n# end managed: skills\ntail\n`);
	});

	it.each([[""], ["   "], ["a\nb"], ["a\r"]])("rejects the block line %j", (bad) => {
		expect(() => upsertManagedBlock("", { ...opts, lines: ["ok", bad] })).toThrow(TypeError);
	});
});

describe("updateGitignore", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "git-utils-ignore-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("creates a missing file", async () => {
		const path = join(dir, ".gitignore");
		expect(await updateGitignore(path, opts)).toBe(true);
		expect(await readFile(path, "utf8")).toBe(`${block}\n`);
	});

	it("updates an existing file and keeps its other lines", async () => {
		const path = join(dir, ".gitignore");
		await writeFile(path, "node_modules\n");
		expect(await updateGitignore(path, opts)).toBe(true);
		expect(await readFile(path, "utf8")).toBe(`node_modules\n\n${block}\n`);
	});

	it("does not write when nothing changes", async () => {
		const path = join(dir, ".gitignore");
		await updateGitignore(path, opts);
		const before = (await stat(path)).mtimeMs;
		await new Promise((r) => setTimeout(r, 20));
		expect(await updateGitignore(path, opts)).toBe(false);
		expect((await stat(path)).mtimeMs).toBe(before);
	});

	it("serializes concurrent updates to the same file so neither is lost", async () => {
		const path = join(dir, ".gitignore");
		await writeFile(path, "node_modules\n");
		const other = { start: "# managed: prompts", end: "# end managed: prompts", lines: ["/.prompts/"] };
		await Promise.all([updateGitignore(path, opts), updateGitignore(path, other)]);
		const text = await readFile(path, "utf8");
		expect(text).toContain("node_modules");
		expect(text).toContain("# end managed: skills");
		expect(text).toContain("# end managed: prompts");
	});

	it("keeps going after a failed update in the queue", async () => {
		const path = join(dir, ".gitignore");
		await expect(updateGitignore(path, { ...opts, lines: [""] })).rejects.toThrow(TypeError);
		expect(await updateGitignore(path, opts)).toBe(true);
	});

	it("writes through a temp file: no stray files, and the file's mode survives", async () => {
		const path = join(dir, ".gitignore");
		await writeFile(path, "a\n");
		await chmod(path, 0o600);
		await updateGitignore(path, opts);
		expect((await stat(path)).mode & 0o777).toBe(0o600);
		expect(await readdir(dir)).toEqual([".gitignore"]);
	});

	it("updates through a symlink instead of replacing it", async () => {
		const real = join(dir, "real-ignore");
		const link = join(dir, ".gitignore");
		await writeFile(real, "a\n");
		await symlink(real, link);
		await updateGitignore(link, opts);
		expect((await stat(link)).isFile()).toBe(true);
		expect(await readFile(real, "utf8")).toContain("# end managed: skills");
		expect((await readdir(dir)).sort()).toEqual([".gitignore", "real-ignore"]);
	});

	it("rejects on a read error other than a missing file, leaving the file alone", async () => {
		const sub = join(dir, "is-a-dir");
		await mkdir(sub);
		await expect(updateGitignore(sub, opts)).rejects.toMatchObject({ code: "EISDIR" });
	});

	it("removes its temp file and rejects when the write fails", async () => {
		const path = join(dir, "sub", ".gitignore");
		await expect(updateGitignore(path, opts)).rejects.toMatchObject({ code: "ENOENT" });
		expect(await readdir(dir)).toEqual([]);
	});
});
