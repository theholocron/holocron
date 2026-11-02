import { describe, expect, it, vi } from "vitest";

import type { NotificationsLayout } from "../../plugin/index.js";
import { resolvePinnedFiles } from "./resolve-pinned-files.js";

const layoutOf = (pinned: NotificationsLayout["pinned"]): NotificationsLayout => ({ pinned });

describe("resolvePinnedFiles", () => {
	it("returns the very layout it was given when no message names a file", async () => {
		const read = vi.fn();
		const layout = layoutOf([{ channel: "welcome", content: "hi" }]);

		expect(await resolvePinnedFiles(layout, "/repo", read)).toEqual({ layout });
		expect(read).not.toHaveBeenCalled();
	});

	it("returns a layout with no pinned messages as it is", async () => {
		const layout: NotificationsLayout = {};

		expect(await resolvePinnedFiles(layout, "/repo", vi.fn())).toEqual({ layout });
	});

	it("fills in a message from its file, keeps the file's name, and leaves a message with content alone", async () => {
		const read = vi.fn().mockResolvedValue("**Rules**\n");
		const layout: NotificationsLayout = {
			...layoutOf([
				{ channel: "welcome", content: "hi" },
				{ channel: "rules", file: "RULES.md" },
			]),
			webhookAvatar: "logo.png",
		};

		const result = await resolvePinnedFiles(layout, "/repo", read);

		expect(read).toHaveBeenCalledWith("/repo", "RULES.md");
		expect(result).toEqual({
			layout: {
				webhookAvatar: "logo.png",
				pinned: [
					{ channel: "welcome", content: "hi" },
					{ channel: "rules", file: "RULES.md", content: "**Rules**" },
				],
			},
		});
	});

	it("reads the message the way Discord will show it: no byte-order mark, \\n line ends, no trailing blank lines", async () => {
		const read = vi.fn().mockResolvedValue(`${String.fromCharCode(0xfeff)}one\r\ntwo\rthree\n\n  \n`);

		const result = await resolvePinnedFiles(layoutOf([{ channel: "rules", file: "RULES.md" }]), "/repo", read);

		expect(result).toEqual({
			layout: { pinned: [{ channel: "rules", file: "RULES.md", content: "one\ntwo\nthree" }] },
		});
	});

	it("refuses a message that gives both content and file, without reading", async () => {
		const read = vi.fn();

		const result = await resolvePinnedFiles(
			layoutOf([{ channel: "rules", content: "x", file: "RULES.md" }]),
			"/repo",
			read
		);

		expect(result).toEqual({ problem: "pinned: the message for `rules` sets both `content` and `file`; use one" });
		expect(read).not.toHaveBeenCalled();
	});

	it("says a missing file does not exist, naming the file and the channel", async () => {
		const missing = Object.assign(new Error("ENOENT: no such file, open '/repo/RULES.md'"), { code: "ENOENT" });

		const result = await resolvePinnedFiles(
			layoutOf([{ channel: "rules", file: "RULES.md" }]),
			"/repo",
			vi.fn().mockRejectedValue(missing)
		);

		expect(result).toEqual({ problem: "pinned: `RULES.md` (for #rules) could not be read: it does not exist" });
	});

	it("gives another reason as it came, without the machine's path to the repository", async () => {
		const result = await resolvePinnedFiles(
			layoutOf([{ channel: "rules", file: "docs" }]),
			"/Users/me/repo",
			vi.fn().mockRejectedValue(new Error("EISDIR at /Users/me/repo/docs"))
		);

		expect(result).toEqual({ problem: "pinned: `docs` (for #rules) could not be read: EISDIR at ./docs" });
	});

	it("gives a thrown value that is not an Error as text", async () => {
		const result = await resolvePinnedFiles(
			layoutOf([{ channel: "rules", file: "RULES.md" }]),
			"/repo",
			vi.fn().mockRejectedValue("denied")
		);

		expect(result).toEqual({ problem: "pinned: `RULES.md` (for #rules) could not be read: denied" });
	});

	it("stops at the first file that cannot be read", async () => {
		const read = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue("later");

		const result = await resolvePinnedFiles(
			layoutOf([
				{ channel: "rules", file: "A.md" },
				{ channel: "welcome", file: "B.md" },
			]),
			"/repo",
			read
		);

		expect(result).toEqual({ problem: "pinned: `A.md` (for #rules) could not be read: boom" });
		expect(read).toHaveBeenCalledTimes(1);
	});

	it("reads through the real reader by default, from the repository root", async () => {
		const result = await resolvePinnedFiles(layoutOf([{ channel: "rules", file: "no-such-file.md" }]), "/");

		expect(result).toEqual({
			problem: "pinned: `no-such-file.md` (for #rules) could not be read: it does not exist",
		});
	});
});
