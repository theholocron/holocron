import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { extractTarEntry, loadLatestRegistry, resetRegistryCache } from "./load-latest-registry.js";

/** One ustar entry: a 512-byte header (name, octal size, checksum) plus content padded to 512. */
function tarEntry(name: string, content: string, prefix = ""): Buffer {
	const header = Buffer.alloc(512);
	header.write(name, 0, "utf8");
	header.write("0000644\0", 100);
	header.write(`${Buffer.byteLength(content).toString(8).padStart(11, "0")}\0`, 124);
	header.write("ustar\0", 257);
	if (prefix) header.write(prefix, 345, "utf8");
	const body = Buffer.alloc(Math.ceil(Buffer.byteLength(content) / 512) * 512);
	body.write(content, "utf8");
	return Buffer.concat([header, body]);
}

const END = Buffer.alloc(1024);

const MODULE = `export const getRegistry = () => ({
	cli: { package: "@theholocron/cli" },
	"github-client": { package: "@theholocron/github-client" },
});
`;

function tarball(entries: Buffer[]): Buffer {
	return gzipSync(Buffer.concat([...entries, END]));
}

function integrity(gz: Buffer): string {
	return `sha512-${createHash("sha512").update(gz).digest("base64")}`;
}

/** A fake `fetch` serving the packument and the tarball. */
function npm(
	gz: Buffer,
	{ version = "1.14.0", integrityOverride = integrity(gz), metaStatus = 200, tarStatus = 200 } = {}
) {
	return vi.fn(async (url: string | URL | Request) => {
		if (String(url).endsWith("/latest")) {
			return new Response(
				JSON.stringify({
					version,
					dist: { tarball: "https://registry.test/rd.tgz", integrity: integrityOverride },
				}),
				{ status: metaStatus }
			);
		}
		return new Response(new Uint8Array(gz), { status: tarStatus });
	});
}

describe("extractTarEntry", () => {
	it("finds an entry past others, across 512-byte padding", () => {
		const tar = Buffer.concat([
			tarEntry("package/package.json", "x".repeat(600)),
			tarEntry("package/dist/index.mjs", "ok"),
			END,
		]);
		expect(extractTarEntry(tar, "package/dist/index.mjs")?.toString()).toBe("ok");
	});

	it("joins a ustar prefix onto the name", () => {
		const tar = Buffer.concat([tarEntry("index.mjs", "prefixed", "package/dist"), END]);
		expect(extractTarEntry(tar, "package/dist/index.mjs")?.toString()).toBe("prefixed");
	});

	it("returns undefined at the end-of-archive block, or when the archive simply runs out", () => {
		expect(extractTarEntry(Buffer.concat([tarEntry("a", "1"), END]), "b")).toBeUndefined();
		expect(extractTarEntry(tarEntry("a", "1"), "b")).toBeUndefined();
	});
});

describe("loadLatestRegistry (holocron#925)", () => {
	beforeEach(() => resetRegistryCache());

	it("verifies, extracts and loads the latest registry's package names", async () => {
		const fetch = npm(tarball([tarEntry("package/dist/index.mjs", MODULE)]));

		const registry = await loadLatestRegistry({ fetch });

		expect(registry.version).toBe("1.14.0");
		expect([...registry.packages]).toEqual(["@theholocron/cli", "@theholocron/github-client"]);
		expect(String(fetch.mock.calls[0]![0])).toBe("https://registry.npmjs.org/@theholocron/registry-doc/latest");
	});

	it("serves a warm instance's repeat calls from cache", async () => {
		const fetch = npm(tarball([tarEntry("package/dist/index.mjs", MODULE)]));

		await loadLatestRegistry({ fetch });
		await loadLatestRegistry({ fetch });

		expect(fetch).toHaveBeenCalledTimes(2); // packument + tarball, once
	});

	it("refuses a tarball whose sha512 doesn't match the packument's integrity", async () => {
		const fetch = npm(tarball([tarEntry("package/dist/index.mjs", MODULE)]), { integrityOverride: "sha512-AAAA" });
		await expect(loadLatestRegistry({ fetch })).rejects.toThrow(/integrity mismatch/);
	});

	it("doesn't cache a failure, so the next call retries", async () => {
		const gz = tarball([tarEntry("package/dist/index.mjs", MODULE)]);
		await expect(loadLatestRegistry({ fetch: npm(gz, { metaStatus: 503 }) })).rejects.toThrow(/returned 503/);

		const registry = await loadLatestRegistry({ fetch: npm(gz) });
		expect(registry.packages.size).toBe(2);
	});

	it("reports a failed tarball download and a tarball without dist/index.mjs", async () => {
		const gz = tarball([tarEntry("package/package.json", "{}")]);
		await expect(loadLatestRegistry({ fetch: npm(gz, { tarStatus: 404 }) })).rejects.toThrow(
			/download returned 404/
		);
		await expect(loadLatestRegistry({ fetch: npm(gz) })).rejects.toThrow(/dist\/index\.mjs not found/);
	});

	it("defaults to the global fetch", async () => {
		const fetch = npm(tarball([tarEntry("package/dist/index.mjs", MODULE)]));
		vi.stubGlobal("fetch", fetch);
		try {
			await loadLatestRegistry();
			expect(fetch).toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
