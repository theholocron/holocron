/**
 * Read a webhook avatar named in a layout: a file path (from the directory the CLI runs in) or an
 * `https://` URL. Returns it as a `data:` URI, which is how providers take an image.
 *
 * The type comes from the first bytes, not from the name or the response header, so what is sent is
 * the image it claims to be.
 */

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

/** Providers cap avatars well below this; it only keeps a wrong file from filling memory. */
export const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

const SIGNATURES: Array<[type: string, bytes: number[]]> = [
	["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
	["image/jpeg", [0xff, 0xd8, 0xff]],
	["image/gif", [0x47, 0x49, 0x46, 0x38]],
];

const tooBig = () => new Error(`it is larger than ${MAX_AVATAR_BYTES / 1024 / 1024} MB`);

export async function loadAvatar(
	source: string,
	baseDir: string = process.cwd(),
	fetchImpl: typeof fetch = fetch
): Promise<string> {
	let bytes: Buffer;
	if (/^https:\/\//i.test(source)) {
		const res = await fetchImpl(source, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
		if (!res.ok) throw new Error(`fetching it answered ${res.status}`);
		if (Number(res.headers.get("content-length")) > MAX_AVATAR_BYTES) throw tooBig();
		bytes = Buffer.from(await res.arrayBuffer());
	} else {
		const path = resolve(baseDir, source);
		if ((await stat(path)).size > MAX_AVATAR_BYTES) throw tooBig();
		bytes = await readFile(path);
	}
	if (bytes.length > MAX_AVATAR_BYTES) throw tooBig();
	const type = SIGNATURES.find(([, sig]) => sig.every((b, i) => bytes[i] === b))?.[0];
	if (!type) throw new Error("it is not a PNG, JPEG or GIF image, which are the formats providers accept");
	return `data:${type};base64,${bytes.toString("base64")}`;
}
