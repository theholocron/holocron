import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { describeAvatarSource, loadAvatar, loadFirstAvatar, MAX_AVATAR_BYTES } from "./avatar.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]);
const GIF = Buffer.from("GIF89a....");

const reply = (body: Buffer | string, init: ResponseInit = {}) =>
	vi.fn(async () => new Response(body, init)) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

const dirWith = async (name: string, content: Buffer | string) => {
	const dir = await mkdtemp(join(tmpdir(), "avatar-"));
	await writeFile(join(dir, name), content);
	return dir;
};

describe("loadAvatar", () => {
	it("reads a file and returns it as a data URI of the type its bytes show", async () => {
		expect(await loadAvatar("a.png", await dirWith("a.png", PNG))).toBe(
			`data:image/png;base64,${PNG.toString("base64")}`
		);
		expect(await loadAvatar("b.jpg", await dirWith("b.jpg", JPEG))).toMatch(/^data:image\/jpeg;base64,/);
		expect(await loadAvatar("c.gif", await dirWith("c.gif", GIF))).toMatch(/^data:image\/gif;base64,/);
	});

	it("goes by the bytes, not the name: a PNG called .webp is a PNG, and text called .png is refused", async () => {
		expect(await loadAvatar("a.webp", await dirWith("a.webp", PNG))).toMatch(/^data:image\/png/);
		await expect(loadAvatar("a.png", await dirWith("a.png", "not an image"))).rejects.toThrow(
			/not a PNG, JPEG or GIF/
		);
		await expect(loadAvatar("a.png", await dirWith("a.png", "RIFF....WEBPVP8 "))).rejects.toThrow(/not a PNG/);
	});

	it("fails on a file that is not there, and on one that is too large", async () => {
		await expect(loadAvatar("nope.png", tmpdir())).rejects.toThrow(/ENOENT/);
		const big = Buffer.alloc(MAX_AVATAR_BYTES + 1);
		await expect(loadAvatar("big.png", await dirWith("big.png", big))).rejects.toThrow(/larger than 8 MB/);
	});

	it("fetches an https URL with a deadline", async () => {
		const fetchImpl = reply(PNG, { headers: { "content-type": "application/octet-stream" } });
		expect(await loadAvatar("https://x.test/a", undefined, fetchImpl)).toBe(
			`data:image/png;base64,${PNG.toString("base64")}`
		);
		const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it("refuses a response that is refused, too large, or not an image", async () => {
		await expect(loadAvatar("https://x.test/a.png", undefined, reply("no", { status: 404 }))).rejects.toThrow(
			/answered 404/
		);
		await expect(
			loadAvatar(
				"https://x.test/a.png",
				undefined,
				reply(PNG, { headers: { "content-length": String(MAX_AVATAR_BYTES + 1) } })
			)
		).rejects.toThrow(/larger than 8 MB/);
		await expect(
			loadAvatar("https://x.test/a.png", undefined, reply(Buffer.alloc(MAX_AVATAR_BYTES + 1)))
		).rejects.toThrow(/larger than 8 MB/);
		await expect(loadAvatar("https://x.test/a.png", undefined, reply("<html>"))).rejects.toThrow(/not a PNG/);
	});
});

describe("describeAvatarSource", () => {
	it("leaves a file path as written", () => {
		expect(describeAvatarSource("media/webhook-avatar.png")).toBe("media/webhook-avatar.png");
	});

	it("keeps an https URL's host and path but drops credentials, query and fragment", () => {
		expect(describeAvatarSource("https://user:pass@cdn.example.com/a/b.png?X-Signature=abc&token=1#frag")).toBe(
			"https://cdn.example.com/a/b.png"
		);
		expect(describeAvatarSource("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
	});

	it("does not echo a URL it cannot parse", () => {
		expect(describeAvatarSource("https://exa mple.com/?token=secret")).toBe("an unreadable https URL");
	});
});

describe("loadFirstAvatar", () => {
	it("uses the first source that can be read, and says which it skipped", async () => {
		const skipped: Array<[string, string]> = [];
		const read = async (source: string) => {
			if (source.startsWith("https://")) throw new Error("fetch failed");
			return `data:image/png;base64,${source}`;
		};
		const uri = await loadFirstAvatar(["https://cdn.example.com/a.png?sig=SECRET", "media/a.png"], read, (s, r) =>
			skipped.push([s, r])
		);
		expect(uri).toBe("data:image/png;base64,media/a.png");
		expect(skipped).toEqual([["https://cdn.example.com/a.png?sig=SECRET", "fetch failed"]]);
	});

	it("stops at the first that works and does not read the rest", async () => {
		const read = vi.fn(async (source: string) => `uri:${source}`);
		expect(await loadFirstAvatar(["a", "b"], read)).toBe("uri:a");
		expect(read).toHaveBeenCalledTimes(1);
	});

	it("names every source and why when none can be read, without leaking a URL's secrets", async () => {
		const read = async (source: string) => {
			throw new Error(source.startsWith("https") ? "fetch failed" : "ENOENT");
		};
		await expect(
			loadFirstAvatar(["https://u:p@cdn.example.com/a.png?sig=SECRET", "media/a.png"], read)
		).rejects.toThrow("`https://cdn.example.com/a.png`: fetch failed; `media/a.png`: ENOENT");
	});

	it("reports a thrown non-error by its text", async () => {
		await expect(
			loadFirstAvatar(["x"], async () => {
				throw "plain";
			})
		).rejects.toThrow("`x`: plain");
	});
});
