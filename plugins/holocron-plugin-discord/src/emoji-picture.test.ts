import { describe, expect, it } from "vitest";

import { chunk, dataUri, makePng, solid, solidPng } from "./__tests__/png.js";
import { decodePng, readDataUri, samePixels } from "./emoji-picture.js";

const rgba = (n: number) => Array.from({ length: n * 4 }, (_, i) => (i * 37 + 11) & 255);
const thrown = (fn: () => unknown): string => {
	try {
		fn();
	} catch (e) {
		return (e as Error).message;
	}
	throw new Error("did not throw");
};

describe("decodePng", () => {
	it.each([0, 1, 2, 3, 4])("reads RGBA rows written with filter %i", (filter) => {
		const samples = rgba(9);
		const pixels = decodePng(makePng({ width: 3, height: 3, colorType: 6, samples, filter }));
		expect([pixels.width, pixels.height]).toEqual([3, 3]);
		expect(Array.from(pixels.data)).toEqual(samples);
	});

	it("follows the Paeth filter when the pixel above and to the left is the closest guess", () => {
		const samples = [55, 60, 50, 70];
		const pixels = decodePng(makePng({ width: 2, height: 2, colorType: 0, samples, filter: 4 }));
		expect(Array.from(pixels.data).filter((_, i) => i % 4 === 0)).toEqual(samples);
	});

	it("reads RGB, grey and grey with alpha, filling in what is missing", () => {
		const rgb = decodePng(makePng({ width: 2, height: 1, colorType: 2, samples: [1, 2, 3, 4, 5, 6] }));
		expect(Array.from(rgb.data)).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
		const grey = decodePng(makePng({ width: 2, height: 1, colorType: 0, samples: [7, 9] }));
		expect(Array.from(grey.data)).toEqual([7, 7, 7, 255, 9, 9, 9, 255]);
		const greyAlpha = decodePng(makePng({ width: 1, height: 1, colorType: 4, samples: [7, 100] }));
		expect(Array.from(greyAlpha.data)).toEqual([7, 7, 7, 100]);
	});

	it("reads a palette, with the alpha of the entries that have one", () => {
		const plte = [10, 20, 30, 40, 50, 60];
		const withAlpha = decodePng(makePng({ width: 2, height: 1, colorType: 3, samples: [0, 1], plte, trns: [5] }));
		expect(Array.from(withAlpha.data)).toEqual([10, 20, 30, 5, 40, 50, 60, 255]);
		const without = decodePng(makePng({ width: 1, height: 1, colorType: 3, samples: [1], plte }));
		expect(Array.from(without.data)).toEqual([40, 50, 60, 255]);
	});

	it("skips chunks it does not know, and stops at the end chunk", () => {
		const png = makePng({
			width: 1,
			height: 1,
			colorType: 6,
			samples: [1, 2, 3, 4],
			extra: [["tEXt", [65, 0, 66]]],
		});
		expect(Array.from(decodePng(png).data)).toEqual([1, 2, 3, 4]);
		const trailing = Uint8Array.from([...png, ...chunk("IDAT", [1, 2, 3])]);
		expect(Array.from(decodePng(trailing).data)).toEqual([1, 2, 3, 4]);
	});

	it("reads a file that ends without its end chunk", () => {
		const png = makePng({ width: 1, height: 1, colorType: 6, samples: [1, 2, 3, 4] });
		expect(decodePng(png.subarray(0, png.length - 12)).width).toBe(1);
	});

	it("refuses what it cannot read", () => {
		const base = { width: 1, height: 1, colorType: 6, samples: [1, 2, 3, 4] };
		expect(thrown(() => decodePng(Uint8Array.from([1, 2, 3])))).toMatch(/not a PNG/);
		expect(thrown(() => decodePng(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0])))).toMatch(/not a PNG/);
		expect(thrown(() => decodePng(makePng({ ...base, bitDepth: 16 })))).toMatch(/bit depth 16/);
		expect(thrown(() => decodePng(makePng({ ...base, interlace: 1 })))).toMatch(/interlaced/);
		expect(thrown(() => decodePng(makePng({ ...base, colorType: 5 })))).toMatch(/unsupported or damaged/);
		expect(thrown(() => decodePng(makePng({ ...base, noIdat: true })))).toMatch(/unsupported or damaged/);
		expect(thrown(() => decodePng(makePng({ ...base, width: 0 })))).toMatch(/unsupported or damaged/);
		expect(
			thrown(() => decodePng(makePng({ ...base, colorType: 2, samples: [1, 2, 3], trns: [0, 0, 0, 0, 0, 0] })))
		).toMatch(/colour key/);
		expect(thrown(() => decodePng(makePng({ ...base, colorType: 0, samples: [1], trns: [0, 0] })))).toMatch(
			/colour key/
		);
		expect(thrown(() => decodePng(makePng({ ...base, truncateData: true })))).toMatch(/truncated PNG data/);
		expect(thrown(() => decodePng(makePng({ ...base, colorType: 3, samples: [5], plte: [1, 2, 3] })))).toMatch(
			/palette/
		);
		expect(thrown(() => decodePng(makePng({ ...base, filter: 9 })))).toMatch(/unknown PNG filter 9/);
	});

	it("refuses a chunk that runs past the end", () => {
		const png = makePng({ width: 1, height: 1, colorType: 6, samples: [1, 2, 3, 4] });
		expect(thrown(() => decodePng(png.subarray(0, 50)))).toMatch(/truncated PNG/);
	});
});

describe("samePixels", () => {
	const grey = [120, 120, 120, 255] as [number, number, number, number];
	const picture = (colour = grey, block?: { size: number; colour: [number, number, number, number] }) =>
		decodePng(solidPng(16, colour, block));

	it("is true for the same picture, and for noise under the tolerance", () => {
		expect(samePixels(picture(), picture())).toBe(true);
		expect(samePixels(picture(), picture([130, 110, 125, 250]))).toBe(true);
	});

	it("is false for a different size", () => {
		expect(samePixels(picture(), decodePng(solidPng(8, grey)))).toBe(false);
		expect(
			samePixels(
				picture(),
				decodePng(
					makePng({ width: 16, height: 8, colorType: 6, samples: solid(16, grey).slice(0, 16 * 8 * 4) })
				)
			)
		).toBe(false);
	});

	it("is false for a recolour, and for a changed alpha", () => {
		expect(samePixels(picture(), picture([40, 180, 70, 255]))).toBe(false);
		expect(samePixels(picture(), picture([120, 120, 120, 200]))).toBe(false);
	});

	it("is false for a small part that moved a lot, and true for a speck under half a percent", () => {
		// 16 x 16 is 256 pixels; one pixel is 0.39 percent, two are 0.78.
		expect(samePixels(picture(), picture(grey, { size: 1, colour: [0, 0, 0, 255] }))).toBe(true);
		const twoPixels = makePng({
			width: 16,
			height: 16,
			colorType: 6,
			samples: solid(16, grey).map((v, i) => (i < 8 && i % 4 !== 3 ? 0 : v)),
		});
		expect(samePixels(picture(), decodePng(twoPixels))).toBe(false);
	});

	it("ignores the colour of pixels that are hardly there", () => {
		const clear = (rgb: number) => decodePng(solidPng(16, [rgb, rgb, rgb, 0]));
		expect(samePixels(clear(0), clear(255))).toBe(true);
		const faint = (rgb: number) => decodePng(solidPng(16, [rgb, rgb, rgb, 10]));
		expect(samePixels(faint(0), faint(255))).toBe(true);
		const half = (rgb: number) => decodePng(solidPng(16, [rgb, rgb, rgb, 128]));
		expect(samePixels(half(0), half(255))).toBe(false);
	});
});

describe("readDataUri", () => {
	it("returns the type and the bytes", () => {
		const uri = dataUri(Uint8Array.from([1, 2, 3]), "image/gif");
		expect(readDataUri(uri).mime).toBe("image/gif");
		expect(Array.from(readDataUri(uri).bytes)).toEqual([1, 2, 3]);
	});

	it("refuses anything else", () => {
		expect(() => readDataUri("https://example.com/a.png")).toThrow(/data: URI/);
	});
});
