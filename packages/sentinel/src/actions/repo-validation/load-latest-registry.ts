/**
 * Loads the latest published `@theholocron/registry-doc` registry at check
 * time (holocron#925). The registry is code, not data: each entry is
 * compiled into the package (`makeClientEntry("github-client", …)`), so
 * Sentinel can't read a repo's pinned version over the API, and its own
 * installed copy would go stale until the next redeploy. Fetching the
 * latest release instead means a new entry counts as soon as
 * `theholocron/docs` publishes it.
 *
 * Steps, all over plain `fetch` against the npm registry:
 * 1. `GET /@theholocron/registry-doc/latest` — the version, tarball URL
 *    and `dist.integrity`.
 * 2. Download the tarball and verify its sha512 against `dist.integrity`
 *    before anything else touches it.
 * 3. Gunzip, pull `package/dist/index.mjs` out of the tar (a self-contained
 *    module — no imports), write it to a temp file, `import()` it and call
 *    `getRegistry()`.
 *
 * The result is cached per warm function instance for {@link CACHE_TTL_MS}
 * so a burst of webhooks doesn't refetch it.
 */

import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const PACKAGE = "@theholocron/registry-doc";
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE}/latest`;
const ENTRY = "package/dist/index.mjs";
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface LatestRegistry {
	/** The registry-doc version loaded, for the check's summary. */
	version: string;
	/** Every registered package name (`LinkEntry.package`), e.g. `@theholocron/cli`. */
	packages: Set<string>;
}

export interface LoadLatestRegistryInput {
	/** Injectable for tests; defaults to the global `fetch`. */
	fetch?: typeof fetch;
}

interface Packument {
	version: string;
	dist: { tarball: string; integrity: string };
}

interface RegistryModule {
	getRegistry: () => Record<string, { package: string }>;
}

let cache: { at: number; value: Promise<LatestRegistry> } | undefined;

/** Clears the per-instance cache. Tests only. */
export function resetRegistryCache(): void {
	cache = undefined;
}

/**
 * The bytes of `name` inside an uncompressed tar archive, or `undefined`
 * when it isn't there. Plain ustar: 512-byte headers, the name in bytes
 * 0–99 (plus a ustar prefix in 345–499), the size as octal in 124–135,
 * the content padded to a 512-byte boundary.
 */
export function extractTarEntry(tar: Buffer, name: string): Buffer | undefined {
	let offset = 0;
	while (offset + 512 <= tar.length) {
		const header = tar.subarray(offset, offset + 512);
		if (header.every((b) => b === 0)) return undefined;
		const field = (start: number, end: number) => header.toString("utf8", start, end).replace(/\0.*$/s, "");
		const prefix = field(345, 500);
		const entryName = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
		const size = Number.parseInt(field(124, 136).trim() || "0", 8);
		const start = offset + 512;
		if (entryName === name) return tar.subarray(start, start + size);
		offset = start + Math.ceil(size / 512) * 512;
	}
	return undefined;
}

async function load(fetchImpl: typeof fetch): Promise<LatestRegistry> {
	const meta = await fetchImpl(REGISTRY_URL, { headers: { accept: "application/json" } });
	if (!meta.ok) throw new Error(`${PACKAGE}: npm registry returned ${meta.status} for ${REGISTRY_URL}`);
	const { version, dist } = (await meta.json()) as Packument;

	const tarball = await fetchImpl(dist.tarball);
	if (!tarball.ok) throw new Error(`${PACKAGE}@${version}: tarball download returned ${tarball.status}`);
	const gz = Buffer.from(await tarball.arrayBuffer());

	const expected = dist.integrity.replace(/^sha512-/, "");
	const actual = createHash("sha512").update(gz).digest("base64");
	if (actual !== expected) throw new Error(`${PACKAGE}@${version}: tarball integrity mismatch`);

	const source = extractTarEntry(gunzipSync(gz), ENTRY);
	if (!source) throw new Error(`${PACKAGE}@${version}: ${ENTRY} not found in tarball`);

	const dir = await mkdtemp(join(tmpdir(), "sentinel-registry-"));
	try {
		const file = join(dir, "registry-doc.mjs");
		await writeFile(file, source);
		const mod = (await import(pathToFileURL(file).href)) as RegistryModule;
		return { version, packages: new Set(Object.values(mod.getRegistry()).map((e) => e.package)) };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

export function loadLatestRegistry(input: LoadLatestRegistryInput = {}): Promise<LatestRegistry> {
	const now = Date.now();
	if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;
	const value = load(input.fetch ?? fetch);
	cache = { at: now, value };
	// A failed load mustn't be served from cache for the next ten minutes.
	value.catch(() => {
		if (cache?.value === value) cache = undefined;
	});
	return value;
}
