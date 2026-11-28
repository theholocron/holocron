import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Discord's limit for an emoji file ("256 KiB", its Emoji resource docs). */
export const MAX_EMOJI_BYTES = 256 * 1024;

const ascii = (bytes: Uint8Array, from: number, to: number): string =>
	Buffer.from(bytes.subarray(from, to)).toString("latin1");

/** The image type the first bytes show, among the ones Discord takes for an emoji (JPEG, PNG, GIF, WebP, AVIF). */
function typeOf(bytes: Uint8Array): string | undefined {
	if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) {
		return "image/png";
	}
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
	if (ascii(bytes, 0, 4) === "GIF8") return "image/gif";
	if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
	if (ascii(bytes, 4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(bytes, 8, 12))) return "image/avif";
	return undefined;
}

/**
 * Reads the picture an emoji is made from, a file in the repo, and returns it as a `data:` URI. The type comes from the
 * first bytes, not the name, and a file Discord would refuse (larger than 256 KiB, or not a JPEG, PNG, GIF, WebP or
 * AVIF image) is refused here, before anything is written. `read` is injected by tests.
 */
export async function loadEmojiImage(
	source: string,
	baseDir: string = process.cwd(),
	read: (path: string) => Promise<Uint8Array> = readFile
): Promise<string> {
	const bytes = await read(resolve(baseDir, source));
	if (bytes.length > MAX_EMOJI_BYTES) {
		throw new Error(`it is ${Math.ceil(bytes.length / 1024)} KiB, and Discord takes an emoji up to 256 KiB`);
	}
	const type = typeOf(bytes);
	if (!type) throw new Error("it is not a JPEG, PNG, GIF, WebP or AVIF image, which are the formats Discord takes");
	return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}
