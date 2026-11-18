import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import type { WikiInspection, WikiProbe } from "@theholocron/cli";

/** How long to wait for the site before calling it unreachable. */
export const SITE_TIMEOUT_MS = 8000;

/** What {@link inspectWiki} reads. */
export interface InspectWikiInput {
	repoRoot: string;
	/** The Fern organization the config declares. */
	fernOrg: string;
	/** The instance URL (`<org>.docs.buildwithfern.com/<base>`) the config implies. */
	expectedUrl: string;
	/** The custom domain the config implies, with its basepath, or undefined. */
	expectedDomain?: string;
	/** Test seam. Defaults to the global `fetch`. */
	fetch?: typeof fetch;
}

async function readText(path: string): Promise<string | null> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return null;
	}
}

/** The value of `key:` inside the `instances:` block, without quotes. */
function instanceValue(docs: string, key: string): string | null {
	const block = docs.match(/^instances:(?:\n[ \t][^\n]*)*/m)?.[0];
	const value = block?.match(new RegExp(`^[ \\t-]*${key}:[ \\t]*(\\S+)`, "m"))?.[1];
	return value ? value.replace(/^["']|["']$/g, "") : null;
}

/** Every Markdown file below `dir`, as a path relative to `root`; an absent directory is an empty list. */
async function markdownBelow(root: string, dir: string): Promise<string[]> {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const found: string[] = [];
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...(await markdownBelow(root, path)));
		else if (entry.name.endsWith(".md") || entry.name.endsWith(".mdx")) found.push(relative(root, path));
	}
	return found.sort();
}

/** One GET, reduced to a status or a reason. The body is read only when `keep` is set, and only on success. */
async function ask(url: string, doFetch: typeof fetch, keep = false): Promise<{ probe: WikiProbe; text?: string }> {
	try {
		const response = await doFetch(`https://${url}`, {
			redirect: "follow",
			signal: AbortSignal.timeout(SITE_TIMEOUT_MS),
		});
		const text = keep && response.ok ? await response.text() : undefined;
		if (text === undefined) await response.body?.cancel();
		return { probe: { url, status: response.status }, ...(text === undefined ? {} : { text }) };
	} catch (err) {
		const timedOut = err instanceof Error && err.name === "TimeoutError";
		return {
			probe: { url, error: timedOut ? `no answer within ${SITE_TIMEOUT_MS / 1000}s` : "could not be reached" },
		};
	}
}

/**
 * Read the Fern wiki without changing anything: `fern/fern.config.json` and the `instances:` block of `fern/docs.yml`
 * against what the config declares, the navigation's `path:` entries against the files under `docs/wiki`, and one GET
 * each for the instance address, the custom domain and the sitemap. No token is sent; the sitemap's body is counted
 * and dropped.
 */
export async function inspectWiki(input: InspectWikiInput): Promise<WikiInspection> {
	const doFetch = input.fetch ?? fetch;
	const fernDir = join(input.repoRoot, "fern");

	const configText = await readText(join(fernDir, "fern.config.json"));
	let found: string | null;
	try {
		const parsed: unknown = configText === null ? null : JSON.parse(configText);
		const organization = (parsed as { organization?: unknown } | null)?.organization;
		found = typeof organization === "string" ? organization : null;
	} catch {
		found = null;
	}

	const docs = await readText(join(fernDir, "docs.yml"));
	const instance =
		docs === null
			? null
			: {
					expectedUrl: input.expectedUrl,
					foundUrl: instanceValue(docs, "url"),
					...(input.expectedDomain
						? { expectedDomain: input.expectedDomain, foundDomain: instanceValue(docs, "custom-domain") }
						: {}),
				};

	let navigation: WikiInspection["navigation"] = null;
	if (docs !== null) {
		const listed = new Set(
			[...docs.matchAll(/^[ \t-]*path:[ \t]*(\S+)/gm)].map((m) =>
				relative(input.repoRoot, resolve(fernDir, m[1].replace(/^["']|["']$/g, "")))
			)
		);
		const missing: string[] = [];
		for (const path of listed) {
			if ((await readText(join(input.repoRoot, path))) === null) missing.push(path);
		}
		const onDisk = await markdownBelow(input.repoRoot, join(input.repoRoot, "docs", "wiki"));
		navigation = { listed: listed.size, missing, unlisted: onDisk.filter((p) => !listed.has(p)) };
	}

	const site: WikiProbe[] = [(await ask(input.expectedUrl, doFetch)).probe];
	if (input.expectedDomain) site.push((await ask(input.expectedDomain, doFetch)).probe);

	const base = (input.expectedDomain ?? input.expectedUrl).replace(/\/$/, "");
	const sitemap = await ask(`${base}/sitemap.xml`, doFetch, true);
	const published = {
		...sitemap.probe,
		...(sitemap.text === undefined ? {} : { pages: (sitemap.text.match(/<loc>/g) ?? []).length }),
	};

	return { organization: { declared: input.fernOrg, found }, instance, site, navigation, published };
}
