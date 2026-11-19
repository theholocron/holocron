import { deflateSync } from "node:zlib";

export interface PngSpec {
	width: number;
	height: number;
	/** 0 grey, 2 RGB, 3 palette, 4 grey+alpha, 6 RGBA. */
	colorType: number;
	/** Every sample of every pixel, row by row. */
	samples: number[];
	/** The filter type of every row (default 0). */
	filter?: number;
	bitDepth?: number;
	interlace?: number;
	plte?: number[];
	trns?: number[];
	/** Raw chunks to add before IDAT, as [type, body]. */
	extra?: Array<[string, number[]]>;
	noIdat?: boolean;
	/** Make the compressed data too short for the size the header gives. */
	truncateData?: boolean;
}

const PER_PIXEL: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function chunk(type: string, body: Uint8Array | number[]): number[] {
	const bytes = Array.from(body);
	const length = bytes.length;
	return [
		(length >>> 24) & 255,
		(length >>> 16) & 255,
		(length >>> 8) & 255,
		length & 255,
		...Array.from(type).map((c) => c.charCodeAt(0)),
		...bytes,
		0,
		0,
		0,
		0,
	];
}

function predict(filter: number, left: number, up: number, upLeft: number): number {
	if (filter === 1) return left;
	if (filter === 2) return up;
	if (filter === 3) return (left + up) >> 1;
	if (filter === 4) {
		const p = left + up - upLeft;
		const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
		return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
	}
	return 0;
}

/** A PNG made from samples, with the filter chosen, for tests of the decoder. */
export function makePng(spec: PngSpec): Uint8Array {
	const per = PER_PIXEL[spec.colorType] ?? 1;
	const stride = spec.width * per;
	const filter = spec.filter ?? 0;
	const raw: number[] = [];
	for (let y = 0; y < spec.height; y++) {
		raw.push(filter);
		for (let x = 0; x < stride; x++) {
			const at = (yy: number, xx: number) => (yy < 0 || xx < 0 ? 0 : spec.samples[yy * stride + xx]);
			raw.push((at(y, x) - predict(filter, at(y, x - per), at(y - 1, x), at(y - 1, x - per))) & 255);
		}
	}
	const header = [
		0,
		0,
		(spec.width >> 8) & 255,
		spec.width & 255,
		0,
		0,
		(spec.height >> 8) & 255,
		spec.height & 255,
		spec.bitDepth ?? 8,
		spec.colorType,
		0,
		0,
		spec.interlace ?? 0,
	];
	const compressed = Array.from(deflateSync(Uint8Array.from(spec.truncateData ? raw.slice(0, 3) : raw)));
	return Uint8Array.from([
		0x89,
		0x50,
		0x4e,
		0x47,
		0x0d,
		0x0a,
		0x1a,
		0x0a,
		...chunk("IHDR", header),
		...(spec.plte ? chunk("PLTE", spec.plte) : []),
		...(spec.trns ? chunk("tRNS", spec.trns) : []),
		...(spec.extra ?? []).flatMap(([type, body]) => chunk(type, body)),
		...(spec.noIdat ? [] : chunk("IDAT", compressed)),
		...chunk("IEND", []),
	]);
}

type Rgba = [number, number, number, number];

/** A square RGBA picture of one colour, with an optional square of another in the top left corner. */
export function solid(size: number, colour: Rgba, block?: { size: number; colour: Rgba }): number[] {
	const out: number[] = [];
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) out.push(...(block && x < block.size && y < block.size ? block.colour : colour));
	}
	return out;
}

/** A square RGBA PNG made with {@link solid}. */
export function solidPng(size: number, colour: Rgba, block?: { size: number; colour: Rgba }): Uint8Array {
	return makePng({ width: size, height: size, colorType: 6, samples: solid(size, colour, block) });
}

/** A `data:` URI for some bytes. */
export function dataUri(bytes: Uint8Array, mime = "image/png"): string {
	return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
