import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDocsLoader } from "../loader.ts";

type StoreEntry = {
	id: string;
	data: Record<string, unknown>;
	body: string;
	filePath: string;
	digest: string;
	rendered: unknown;
};

function makeCtx(rootDir: string) {
	const store = new Map<string, StoreEntry>();
	const watched: string[] = [];
	const ctx = {
		config: { root: pathToFileURL(rootDir + "/") },
		store: {
			clear: vi.fn(() => store.clear()),
			set: vi.fn((entry: StoreEntry) => store.set(entry.id, entry)),
			keys: () => store.keys(),
		},
		parseData: vi.fn(
			async ({
				data,
			}: {
				id: string;
				data: Record<string, unknown>;
				filePath: string;
			}) => data,
		),
		renderMarkdown: vi.fn(async (body: string) => ({
			html: `<p>${body.trim()}</p>`,
			metadata: {},
		})),
		generateDigest: vi.fn((raw: string) => raw.slice(0, 8)),
		watcher: { add: vi.fn((p: string) => watched.push(p)) },
	};
	return { ctx, store, watched };
}

describe("createDocsLoader", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "docs-loader-test-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true });
	});

	it("returns a loader named 'docs-loader'", () => {
		expect(createDocsLoader([]).name).toBe("docs-loader");
	});

	it("clears the store before loading", async () => {
		const { ctx } = makeCtx(tmpDir);
		await createDocsLoader([{ dir: tmpDir, slug: "" }]).load(ctx as never);
		expect(ctx.store.clear).toHaveBeenCalledOnce();
	});

	it("loads a markdown file and stores an entry", async () => {
		await writeFile(
			join(tmpDir, "guide.md"),
			"---\ntitle: Guide\n---\n\nHello.",
		);
		const { ctx, store } = makeCtx(tmpDir);

		await createDocsLoader([{ dir: tmpDir, slug: "" }]).load(ctx as never);

		expect(store.has("guide")).toBe(true);
		const entry = store.get("guide")!;
		expect(entry.data).toMatchObject({ title: "Guide" });
		expect(entry.body).toContain("Hello.");
	});

	it("applies slug prefix to non-index entries", async () => {
		await writeFile(
			join(tmpDir, "api.md"),
			"---\ntitle: API\n---\n\nDocs.",
		);
		const { ctx, store } = makeCtx(tmpDir);

		await createDocsLoader([{ dir: tmpDir, slug: "projects/mylib" }]).load(
			ctx as never,
		);

		expect(store.has("projects/mylib/api")).toBe(true);
	});

	it("maps index.md to the slug prefix", async () => {
		await writeFile(
			join(tmpDir, "index.md"),
			"---\ntitle: Home\n---\n\nWelcome.",
		);
		const { ctx, store } = makeCtx(tmpDir);

		await createDocsLoader([{ dir: tmpDir, slug: "projects/mylib" }]).load(
			ctx as never,
		);

		expect(store.has("projects/mylib")).toBe(true);
	});

	it("maps root index.md to 'index' when slug is empty", async () => {
		await writeFile(
			join(tmpDir, "index.md"),
			"---\ntitle: Home\n---\n\nWelcome.",
		);
		const { ctx, store } = makeCtx(tmpDir);

		await createDocsLoader([{ dir: tmpDir, slug: "" }]).load(ctx as never);

		expect(store.has("index")).toBe(true);
	});

	it("walks subdirectories recursively", async () => {
		const subDir = join(tmpDir, "guides");
		await mkdir(subDir, { recursive: true });
		await writeFile(
			join(subDir, "start.md"),
			"---\ntitle: Start\n---\n\nBegin.",
		);
		const { ctx, store } = makeCtx(tmpDir);

		await createDocsLoader([{ dir: tmpDir, slug: "" }]).load(ctx as never);

		expect(store.has("guides/start")).toBe(true);
	});

	it("skips files whose names start with _", async () => {
		await writeFile(
			join(tmpDir, "_draft.md"),
			"---\ntitle: Draft\n---\n\nNot ready.",
		);
		await writeFile(
			join(tmpDir, "public.md"),
			"---\ntitle: Public\n---\n\nReady.",
		);
		const { ctx, store } = makeCtx(tmpDir);

		await createDocsLoader([{ dir: tmpDir, slug: "" }]).load(ctx as never);

		expect(store.has("_draft")).toBe(false);
		expect(store.has("public")).toBe(true);
	});

	it("ignores non-markdown files", async () => {
		await writeFile(join(tmpDir, "data.json"), '{"key":"value"}');
		await writeFile(
			join(tmpDir, "page.md"),
			"---\ntitle: Page\n---\n\nContent.",
		);
		const { ctx, store } = makeCtx(tmpDir);

		await createDocsLoader([{ dir: tmpDir, slug: "" }]).load(ctx as never);

		expect(store.size).toBe(1);
		expect(store.has("page")).toBe(true);
	});

	it("calls ctx.renderMarkdown with body and fileURL for each file", async () => {
		await writeFile(
			join(tmpDir, "page.md"),
			"---\ntitle: Page\n---\n\nContent here.",
		);
		const { ctx } = makeCtx(tmpDir);

		await createDocsLoader([{ dir: tmpDir, slug: "" }]).load(ctx as never);

		expect(ctx.renderMarkdown).toHaveBeenCalledOnce();
		expect(ctx.renderMarkdown).toHaveBeenCalledWith(
			expect.stringContaining("Content here."),
			expect.objectContaining({ fileURL: expect.any(URL) }),
		);
	});

	it("registers each file with the watcher", async () => {
		await writeFile(
			join(tmpDir, "page.md"),
			"---\ntitle: Page\n---\n\nContent.",
		);
		const { ctx, watched } = makeCtx(tmpDir);

		await createDocsLoader([{ dir: tmpDir, slug: "" }]).load(ctx as never);

		expect(watched).toHaveLength(1);
		expect(watched[0]).toContain("page.md");
	});

	it("loads from multiple sources without clobbering", async () => {
		const dir1 = join(tmpDir, "src1");
		const dir2 = join(tmpDir, "src2");
		await mkdir(dir1, { recursive: true });
		await mkdir(dir2, { recursive: true });
		await writeFile(join(dir1, "a.md"), "---\ntitle: A\n---\n\nAaa.");
		await writeFile(join(dir2, "b.md"), "---\ntitle: B\n---\n\nBbb.");
		const { ctx, store } = makeCtx(tmpDir);

		await createDocsLoader([
			{ dir: dir1, slug: "one" },
			{ dir: dir2, slug: "two" },
		]).load(ctx as never);

		expect(store.has("one/a")).toBe(true);
		expect(store.has("two/b")).toBe(true);
	});

	it("resolves a package source via node_modules", async () => {
		// Entry point is in a dist/ subdirectory so resolvePackageContentDir must
		// walk up one level before it finds package.json — this covers the dir
		// traversal loop inside resolvePackageContentDir.
		const pkgDir = join(tmpDir, "node_modules", "fake-content-pkg");
		await mkdir(join(pkgDir, "dist"), { recursive: true });
		await mkdir(join(pkgDir, "content"), { recursive: true });
		await writeFile(join(pkgDir, "dist", "index.js"), "");
		await writeFile(
			join(pkgDir, "package.json"),
			JSON.stringify({
				name: "fake-content-pkg",
				main: "./dist/index.js",
			}),
		);
		await writeFile(
			join(pkgDir, "content", "page.md"),
			"---\ntitle: From Package\n---\n\nPackage content.",
		);

		const { ctx, store } = makeCtx(tmpDir);

		await createDocsLoader([
			{ package: "fake-content-pkg", slug: "pkg" },
		]).load(ctx as never);

		expect(store.has("pkg/page")).toBe(true);
		expect(store.get("pkg/page")!.data).toMatchObject({
			title: "From Package",
		});
	});

	it("throws when no package.json is found walking up from the resolved entry point", async () => {
		// A package with no package.json causes resolvePackageContentDir to
		// exhaust the upward walk and throw its own error (covers line 47).
		const pkgDir = join(tmpDir, "node_modules", "no-pkg-json");
		await mkdir(pkgDir, { recursive: true });
		await writeFile(join(pkgDir, "index.js"), "");

		const { ctx } = makeCtx(tmpDir);

		await expect(
			createDocsLoader([{ package: "no-pkg-json", slug: "pkg" }]).load(
				ctx as never,
			),
		).rejects.toThrow(/Could not resolve content directory/);
	});

	it("throws ENOENT when the resolved package has no content/ directory", async () => {
		const pkgDir = join(tmpDir, "node_modules", "no-content-pkg");
		await mkdir(pkgDir, { recursive: true });
		await writeFile(join(pkgDir, "index.js"), "");
		await writeFile(
			join(pkgDir, "package.json"),
			JSON.stringify({ name: "no-content-pkg", main: "./index.js" }),
		);

		const { ctx } = makeCtx(tmpDir);

		// resolvePackageContentDir finds the package root and returns <root>/content;
		// walk() then throws ENOENT because that directory doesn't exist.
		await expect(
			createDocsLoader([{ package: "no-content-pkg", slug: "pkg" }]).load(
				ctx as never,
			),
		).rejects.toThrow(/ENOENT/);
	});
});
