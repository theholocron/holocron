import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Loader, LoaderContext } from "astro/loaders";
import matter from "gray-matter";

export type DocsSource =
	| { dir: string; slug: string }
	| { package: string; slug: string };

const EXTENSIONS = new Set([".md", ".mdx"]);

async function* walk(dir: string): AsyncGenerator<string> {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (entry.name.startsWith("_")) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else if (EXTENSIONS.has(extname(entry.name))) yield full;
	}
}

function computeId(
	filePath: string,
	baseDir: string,
	slugPrefix: string,
): string {
	const rel = relative(baseDir, filePath).replace(/\\/g, "/");
	const noExt = rel.replace(/\.(mdx?)$/, "");
	const noIndex = noExt.replace(/\/index$/, "").replace(/^index$/, "");
	if (noIndex) {
		return slugPrefix ? `${slugPrefix}/${noIndex}` : noIndex;
	}
	return slugPrefix || "index";
}

function resolvePackageContentDir(packageName: string, root: URL): string {
	const req = createRequire(root);

	// Fast path: resolve the package's main entry and walk up to package.json.
	// This works for packages that have a built dist/ directory.
	try {
		const main = req.resolve(packageName);
		let dir = dirname(main);
		while (dir !== dirname(dir)) {
			if (existsSync(join(dir, "package.json")))
				return join(dir, "content");
			dir = dirname(dir);
		}
	} catch {
		// fast path failed — dist/ not built; fall through to node_modules search
	}

	// Fallback: search each node_modules directory on the resolution path.
	// This handles packages published without a built dist/ (e.g. content-only
	// packages whose main entry is listed in package.json but never compiled).
	const parts = packageName.startsWith("@")
		? packageName.split("/", 2)
		: [packageName];
	for (const searchPath of req.resolve.paths(packageName) ?? []) {
		const candidate = join(searchPath, ...parts);
		if (existsSync(join(candidate, "package.json"))) {
			return join(candidate, "content");
		}
	}

	throw new Error(`Could not resolve content directory for ${packageName}`);
}

/**
 * Loads Markdown/MDX files from local directories or installed npm content
 * packages into a Starlight docs collection.
 *
 * Each source is either a local directory path or an npm package name whose
 * published `content/` directory will be resolved at build time.
 *
 * @example
 * // content.config.ts
 * import { createDocsLoader } from "@theholocron/docs-theme/loader";
 * import { fileURLToPath } from "node:url";
 *
 * export const collections = {
 *   docs: defineCollection({
 *     loader: createDocsLoader([
 *       { dir: fileURLToPath(new URL("content/docs", import.meta.url)), slug: "" },
 *       { package: "@theholocron/clients-docs", slug: "projects/clients" },
 *     ]),
 *     schema: docsSchema(),
 *   }),
 * };
 */
export function createDocsLoader(sources: DocsSource[]): Loader {
	return {
		name: "docs-loader",
		async load(ctx: LoaderContext) {
			ctx.store.clear();
			const siteRoot = fileURLToPath(ctx.config.root);

			const resolved = sources.map((s) =>
				"package" in s
					? {
							dir: resolvePackageContentDir(
								s.package,
								ctx.config.root,
							),
							slug: s.slug,
						}
					: s,
			);

			for (const { dir, slug: slugPrefix } of resolved) {
				for await (const absPath of walk(dir)) {
					const id = computeId(absPath, dir, slugPrefix);
					const raw = await readFile(absPath, "utf-8");
					const { data: frontmatter, content: body } = matter(raw);
					const digest = ctx.generateDigest(raw);
					const filePath = relative(siteRoot, absPath);
					const data = await ctx.parseData({
						id,
						data: frontmatter,
						filePath,
					});
					const rendered = await ctx.renderMarkdown(body, {
						fileURL: pathToFileURL(absPath),
					});
					ctx.store.set({
						id,
						data,
						body,
						filePath,
						digest,
						rendered,
					});
					ctx.watcher?.add(absPath);
				}
			}
		},
	};
}
