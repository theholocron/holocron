/**
 * Read a webhook avatar named in a layout: a file path (from the directory the CLI runs in) or an
 * `https://` URL. Returns it as a `data:` URI, which is how providers take an image.
 */

import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const TYPES: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
};

export async function loadAvatar(
	source: string,
	baseDir: string = process.cwd(),
	fetchImpl: typeof fetch = fetch
): Promise<string> {
	const byExtension = TYPES[extname(source.split("?")[0]!).toLowerCase()];
	let bytes: Buffer;
	let type = byExtension;
	if (/^https:\/\//i.test(source)) {
		const res = await fetchImpl(source);
		if (!res.ok) throw new Error(`fetching it answered ${res.status}`);
		bytes = Buffer.from(await res.arrayBuffer());
		const header = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
		type = header && Object.values(TYPES).includes(header) ? header : byExtension;
	} else {
		bytes = await readFile(resolve(baseDir, source));
	}
	if (!type) throw new Error("it is not a PNG, JPEG or GIF image, which are the formats providers accept");
	return `data:${type};base64,${bytes.toString("base64")}`;
}
