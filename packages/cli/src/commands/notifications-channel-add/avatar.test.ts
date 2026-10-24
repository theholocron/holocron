import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadAvatar } from "./avatar.js";

const reply = (body: string, init: ResponseInit = {}) =>
	(async () => new Response(body, init)) as unknown as typeof fetch;

describe("loadAvatar", () => {
	it("reads a file next to the base directory and returns it as a data URI", async () => {
		const dir = await mkdtemp(join(tmpdir(), "avatar-"));
		await writeFile(join(dir, "a.PNG"), "hi");
		expect(await loadAvatar("a.PNG", dir)).toBe(`data:image/png;base64,${Buffer.from("hi").toString("base64")}`);
		await writeFile(join(dir, "b.jpeg"), "x");
		expect(await loadAvatar("b.jpeg", dir)).toMatch(/^data:image\/jpeg;base64,/);
	});

	it("refuses a format providers do not take, such as WebP", async () => {
		const dir = await mkdtemp(join(tmpdir(), "avatar-"));
		await writeFile(join(dir, "a.webp"), "x");
		await expect(loadAvatar("a.webp", dir)).rejects.toThrow(/not a PNG, JPEG or GIF/);
	});

	it("fails on a file that is not there", async () => {
		await expect(loadAvatar("nope.png", tmpdir())).rejects.toThrow(/ENOENT/);
	});

	it("fetches an https URL, taking the type from the response", async () => {
		const out = await loadAvatar(
			"https://x.test/a",
			undefined,
			reply("img", { headers: { "content-type": "image/gif; charset=x" } })
		);
		expect(out).toBe(`data:image/gif;base64,${Buffer.from("img").toString("base64")}`);
	});

	it("falls back to the extension when the response does not say, and refuses when neither does", async () => {
		expect(
			await loadAvatar(
				"https://x.test/a.png?raw=1",
				undefined,
				reply("i", { headers: { "content-type": "application/octet-stream" } })
			)
		).toMatch(/^data:image\/png;base64,/);
		expect(await loadAvatar("https://x.test/a.png", undefined, reply("i"))).toMatch(/^data:image\/png/);
		await expect(loadAvatar("https://x.test/a", undefined, reply("i"))).rejects.toThrow(/not a PNG/);
	});

	it("fails when the fetch is refused", async () => {
		await expect(loadAvatar("https://x.test/a.png", undefined, reply("no", { status: 404 }))).rejects.toThrow(
			/answered 404/
		);
	});
});
