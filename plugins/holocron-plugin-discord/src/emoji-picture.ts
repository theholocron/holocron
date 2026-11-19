import { inflateSync } from "node:zlib";

/** An image as 8-bit RGBA, row by row. */
export interface Pixels {
	width: number;
	height: number;
	data: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Samples per pixel for each PNG colour type we read (8 bits each): grey, RGB, palette, grey+alpha, RGBA. */
const SAMPLES: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Reads a PNG into RGBA. Only what an emoji is: 8 bits per sample, not interlaced, any of the five colour types.
 * Anything else throws, and so does a damaged file; the caller treats a throw as "cannot compare".
 */
export function decodePng(bytes: Uint8Array): Pixels {
	if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error("not a PNG");
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let width = 0;
	let height = 0;
	let colorType = -1;
	let palette: Uint8Array = new Uint8Array(0);
	let alphas: Uint8Array = new Uint8Array(0);
	const parts: Uint8Array[] = [];
	for (let at = 8; at + 8 <= bytes.length;) {
		const length = view.getUint32(at);
		const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
		const body = bytes.subarray(at + 8, at + 8 + length);
		if (body.length < length) throw new Error("truncated PNG");
		if (type === "IHDR") {
			width = view.getUint32(at + 8);
			height = view.getUint32(at + 12);
			if (body[8] !== 8) throw new Error(`unsupported bit depth ${body[8]}`);
			colorType = body[9]!;
			if (body[12] !== 0) throw new Error("interlaced PNGs are not supported");
		} else if (type === "PLTE") palette = body;
		else if (type === "tRNS") alphas = body;
		else if (type === "IDAT") parts.push(body);
		else if (type === "IEND") break;
		at += 12 + length;
	}
	const samples = SAMPLES[colorType];
	if (!samples || width === 0 || height === 0 || parts.length === 0) throw new Error("unsupported or damaged PNG");
	if ((colorType === 0 || colorType === 2) && alphas.length > 0) throw new Error("PNG colour key is not supported");
	const raw = inflateSync(Buffer.concat(parts));
	const stride = width * samples;
	if (raw.length < (stride + 1) * height) throw new Error("truncated PNG data");

	// Undo the per-row filters.
	const rows = new Uint8Array(stride * height);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		for (let x = 0; x < stride; x++) {
			const value = raw[y * (stride + 1) + 1 + x];
			const left = x >= samples ? rows[y * stride + x - samples] : 0;
			const up = y > 0 ? rows[(y - 1) * stride + x] : 0;
			const upLeft = y > 0 && x >= samples ? rows[(y - 1) * stride + x - samples] : 0;
			rows[y * stride + x] = (value + predictor(filter, left, up, upLeft)) & 0xff;
		}
	}

	const data = new Uint8Array(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		const s = i * samples;
		const o = i * 4;
		if (colorType === 6) data.set(rows.subarray(s, s + 4), o);
		else if (colorType === 2) data.set([rows[s], rows[s + 1], rows[s + 2], 255], o);
		else if (colorType === 0) data.set([rows[s], rows[s], rows[s], 255], o);
		else if (colorType === 4) data.set([rows[s], rows[s], rows[s], rows[s + 1]], o);
		else {
			const p = rows[s] * 3;
			if (p + 2 >= palette.length) throw new Error("PNG palette index out of range");
			data.set([palette[p], palette[p + 1], palette[p + 2], alphas[rows[s]] ?? 255], o);
		}
	}
	return { width, height, data };
}

function predictor(filter: number, left: number, up: number, upLeft: number): number {
	if (filter === 0) return 0;
	if (filter === 1) return left;
	if (filter === 2) return up;
	if (filter === 3) return (left + up) >> 1;
	if (filter === 4) {
		const p = left + up - upLeft;
		const pa = Math.abs(p - left);
		const pb = Math.abs(p - up);
		const pc = Math.abs(p - upLeft);
		return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
	}
	throw new Error(`unknown PNG filter ${filter}`);
}

/** A pixel counts as different when a channel is further apart than this (of 255), so re-encoding noise is not a change. */
const CHANNEL_TOLERANCE = 24;
/** Pixels this transparent have colours that mean nothing, and a half-covered edge pixel's colour is unreliable. */
const OPAQUE_ENOUGH = 32;
/** The share of pixels that may differ before the pictures are called different (a recolour moves far more). */
const DIFFERENT_SHARE = 0.005;

/**
 * Whether two pictures show the same thing: equal size, and at most half a percent of pixels further apart than
 * the tolerance (alpha always compared, colour only where both pixels are visible). A different size is different.
 */
export function samePixels(a: Pixels, b: Pixels): boolean {
	if (a.width !== b.width || a.height !== b.height) return false;
	let differing = 0;
	for (let i = 0; i < a.width * a.height; i++) {
		const o = i * 4;
		let far = Math.abs(a.data[o + 3] - b.data[o + 3]) > CHANNEL_TOLERANCE;
		if (!far && a.data[o + 3] >= OPAQUE_ENOUGH && b.data[o + 3] >= OPAQUE_ENOUGH) {
			far = [0, 1, 2].some((c) => Math.abs(a.data[o + c] - b.data[o + c]) > CHANNEL_TOLERANCE);
		}
		if (far) differing++;
	}
	return differing / (a.width * a.height) <= DIFFERENT_SHARE;
}

/** The bytes of a `data:` URI, and its media type; throws for anything else. */
export function readDataUri(uri: string): { mime: string; bytes: Uint8Array } {
	const match = /^data:([^;,]+);base64,(.*)$/s.exec(uri);
	if (!match) throw new Error("not a base64 data: URI");
	return { mime: match[1], bytes: Buffer.from(match[2], "base64") };
}
