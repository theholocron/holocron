import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { NotificationsLayout } from "../../plugin/index.js";
import {
	emojiConflictProblem,
	layoutEmojis,
	loadEmojiImage,
	MAX_EMOJI_BYTES,
	parseReaction,
	reactionProblem,
	reactionSpelling,
} from "./index.js";

const layoutOf = (...reactions: Array<{ default?: unknown; starter?: unknown[] }>): NotificationsLayout =>
	({
		categories: [
			{
				name: "A",
				channels: reactions.map((r, i) => ({
					name: `f${i}`,
					kind: "forum",
					...(r.default === undefined ? {} : { defaultReaction: r.default }),
					...(r.starter ? { starterReactions: r.starter } : {}),
				})),
			},
			{ name: "empty" },
		],
	}) as NotificationsLayout;

describe("parseReaction and reactionSpelling", () => {
	it("reads :name: as a server emoji and anything else as Unicode", () => {
		expect(parseReaction(":git_merge:")).toEqual({ kind: "custom", name: "git_merge" });
		expect(parseReaction("🔀")).toEqual({ kind: "unicode", value: "🔀" });
		expect(parseReaction("✅")).toEqual({ kind: "unicode", value: "✅" });
		expect(parseReaction(":a:")).toEqual({ kind: "unicode", value: ":a:" });
	});

	it("reads the object form, with or without an image, and keeps an invalid name as written", () => {
		expect(parseReaction({ emoji: ":git_merge:" })).toEqual({ kind: "custom", name: "git_merge" });
		expect(parseReaction({ emoji: ":git_merge:", image: ".holocron/media/a.png" })).toEqual({
			kind: "custom",
			name: "git_merge",
			image: ".holocron/media/a.png",
		});
		expect(parseReaction({ emoji: "bad name" })).toEqual({ kind: "custom", name: "bad name" });
	});

	it("spells a reaction the way a layout writes it", () => {
		expect(reactionSpelling(":git_merge:")).toBe(":git_merge:");
		expect(reactionSpelling({ emoji: ":git_merge:", image: ".holocron/media/a.png" })).toBe(":git_merge:");
		expect(reactionSpelling("🔀")).toBe("🔀");
	});
});

describe("reactionProblem", () => {
	const ok = [
		"✅",
		"👍",
		":git_merge:",
		":ab:",
		{ emoji: ":git_merge:" },
		{ emoji: ":git_merge:", image: ".holocron/media/emoji/git_merge.png" },
		{ emoji: ":git_merge:", image: ".holocron/media/./emoji/../emoji/git_merge.png" },
	];
	it.each(ok)("accepts %j", (reaction) => {
		expect(reactionProblem("a reaction", reaction)).toBeUndefined();
	});

	it("refuses an empty reaction in the words the layout checks have always used", () => {
		expect(reactionProblem("`defaultReaction`", " ")).toBe("`defaultReaction` is empty");
		expect(reactionProblem("a starter reaction", "")).toBe("a starter reaction is empty");
		expect(reactionProblem("a starter reaction", { emoji: "" })).toBe("a starter reaction is empty");
	});

	it("refuses a null or a value of the wrong type", () => {
		expect(reactionProblem("a reaction", null)).toMatch(/must be an emoji/);
		expect(reactionProblem("a reaction", 3 as never)).toMatch(/must be an emoji/);
		expect(reactionProblem("a reaction", { emoji: 3 } as never)).toMatch(/is empty/);
	});

	it("refuses a word that would be sent to Discord as text, and a malformed :name:", () => {
		for (const bad of ["git_merge", "merge", ":git_merge", "git_merge:", "::", ":a:", ":bad name:", ":a-b:"]) {
			expect(reactionProblem("a reaction", bad)).toMatch(/is not an emoji; write a server emoji as `:name:`/);
		}
		expect(reactionProblem("a reaction", ":" + "x".repeat(33) + ":")).toMatch(/is not an emoji/);
	});

	it("takes only the :name: form in the object", () => {
		expect(reactionProblem("a reaction", { emoji: "🔀" })).toMatch(
			/`emoji` must be a server emoji written `:name:`/
		);
		expect(reactionProblem("a reaction", { emoji: "git_merge" })).toMatch(/not `git_merge`/);
	});

	it("keeps an image to a file under .holocron/media/", () => {
		const image = (value: unknown) =>
			reactionProblem("a reaction", { emoji: ":git_merge:", image: value as string });
		expect(image("")).toMatch(/`image` is empty/);
		expect(image(3)).toMatch(/`image` is empty/);
		expect(image("https://example.com/a.png")).toMatch(/not a URL/);
		expect(image("data:image/png;base64,AAAA")).toMatch(/not a URL/);
		expect(image("media/a.png")).toMatch(/must be a file under `.holocron\/media\/`, not `media\/a.png`/);
		expect(image(".holocron/media/../../secret.png")).toMatch(/must be a file under/);
		expect(image(".holocron/media/")).toMatch(/must be a file under/);
		expect(image("/etc/passwd")).toMatch(/must be a file under/);
	});
});

describe("layoutEmojis", () => {
	it("lists each server emoji once, in first-named order, keeping a picture from any use", () => {
		const emojis = layoutEmojis(
			layoutOf(
				{ default: ":git_merge:", starter: ["✅", ":git_branch:"] },
				{ default: { emoji: ":git_merge:", image: ".holocron/media/a.png" }, starter: [":git_branch:"] }
			)
		);
		expect(emojis).toEqual([{ name: "git_merge", image: ".holocron/media/a.png" }, { name: "git_branch" }]);
	});

	it("keeps the first picture when a second use names another", () => {
		const emojis = layoutEmojis(
			layoutOf({
				default: { emoji: ":git_merge:", image: ".holocron/media/a.png" },
				starter: [{ emoji: ":git_merge:", image: ".holocron/media/b.png" }],
			})
		);
		expect(emojis).toEqual([{ name: "git_merge", image: ".holocron/media/a.png" }]);
	});

	it("is empty for Unicode reactions, no reactions, no layout and no channels", () => {
		expect(layoutEmojis(layoutOf({ default: "🔀", starter: ["✅"] }))).toEqual([]);
		expect(layoutEmojis(layoutOf({}))).toEqual([]);
		expect(layoutEmojis(undefined)).toEqual([]);
		expect(layoutEmojis({ categories: [{ name: "A" }] })).toEqual([]);
	});
});

describe("emojiConflictProblem", () => {
	it("allows one picture, even written twice or spelled two ways", () => {
		const layout = layoutOf({
			default: { emoji: ":git_merge:", image: ".holocron/media/a.png" },
			starter: [{ emoji: ":git_merge:", image: ".holocron/media/./a.png" }, ":git_merge:", "✅"],
		});
		expect(emojiConflictProblem(layout)).toBeUndefined();
	});

	it("names an emoji given two pictures", () => {
		const layout = layoutOf({
			default: { emoji: ":git_merge:", image: ".holocron/media/a.png" },
			starter: [{ emoji: ":git_merge:", image: ".holocron/media/b.png" }],
		});
		expect(emojiConflictProblem(layout)).toBe(
			"emoji `:git_merge:` is given two different images, `.holocron/media/a.png` and `.holocron/media/b.png`"
		);
	});

	it("is quiet with no layout channels", () => {
		expect(emojiConflictProblem({})).toBeUndefined();
		expect(emojiConflictProblem({ categories: [{ name: "A" }] })).toBeUndefined();
	});
});

describe("loadEmojiImage", () => {
	const bytes = (...head: number[]) => Uint8Array.from([...head, ...new Array<number>(32).fill(0)]);
	const ascii = (text: string, at = 0) => {
		const out = new Uint8Array(40);
		out.set(Buffer.from(text, "latin1"), at);
		return out;
	};
	const read = (data: Uint8Array) => async () => data;

	it.each([
		["png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "image/png"],
		["jpeg", bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg"],
		["gif", ascii("GIF89a"), "image/gif"],
		[
			"webp",
			(() => {
				const b = ascii("RIFF");
				b.set(Buffer.from("WEBP"), 8);
				return b;
			})(),
			"image/webp",
		],
		[
			"avif",
			(() => {
				const b = ascii("ftyp", 4);
				b.set(Buffer.from("avif"), 8);
				return b;
			})(),
			"image/avif",
		],
		[
			"avif sequence",
			(() => {
				const b = ascii("ftyp", 4);
				b.set(Buffer.from("avis"), 8);
				return b;
			})(),
			"image/avif",
		],
	])("reads a %s by its bytes, whatever the name says", async (_name, data, type) => {
		const uri = await loadEmojiImage("any.bin", "/repo", read(data));
		expect(uri).toBe(`data:${type};base64,${Buffer.from(data).toString("base64")}`);
	});

	it("reads the path from the repository root", async () => {
		let seen = "";
		await loadEmojiImage(".holocron/media/a.png", "/repo", async (path) => {
			seen = path;
			return bytes(0xff, 0xd8, 0xff);
		});
		expect(seen).toBe("/repo/.holocron/media/a.png");
	});

	it("refuses a file larger than 256 KiB, naming its size, and takes exactly 256 KiB", async () => {
		const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
		const exact = new Uint8Array(MAX_EMOJI_BYTES);
		exact.set(png);
		await expect(loadEmojiImage("a.png", "/repo", read(exact))).resolves.toMatch(/^data:image\/png;base64,/);
		const over = new Uint8Array(MAX_EMOJI_BYTES + 1);
		over.set(png);
		await expect(loadEmojiImage("a.png", "/repo", read(over))).rejects.toThrow(/257 KiB.*up to 256 KiB/);
	});

	it("refuses formats Discord does not take, and files too short to tell", async () => {
		for (const data of [ascii("BM"), ascii("%PDF-1.4"), ascii("<svg"), new Uint8Array(0), bytes(0x89, 0x50)]) {
			await expect(loadEmojiImage("a.png", "/repo", read(data))).rejects.toThrow(
				/not a JPEG, PNG, GIF, WebP or AVIF/
			);
		}
		const riffNotWebp = ascii("RIFF");
		riffNotWebp.set(Buffer.from("WAVE"), 8);
		await expect(loadEmojiImage("a.wav", "/repo", read(riffNotWebp))).rejects.toThrow(/not a JPEG/);
		const heic = ascii("ftyp", 4);
		heic.set(Buffer.from("heic"), 8);
		await expect(loadEmojiImage("a.heic", "/repo", read(heic))).rejects.toThrow(/not a JPEG/);
	});

	it("reads a real file by default", async () => {
		const dir = await mkdtemp(join(tmpdir(), "emoji-"));
		await writeFile(join(dir, "a.png"), Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]));
		await expect(loadEmojiImage("a.png", dir)).resolves.toMatch(/^data:image\/png;base64,/);
	});

	it("resolves from the working directory when no root is given", async () => {
		await expect(loadEmojiImage("package.json")).rejects.toThrow(/not a JPEG/);
	});
});
