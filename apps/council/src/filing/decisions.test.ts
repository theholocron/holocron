import { describe, expect, it } from "vitest";

import { decideFileable } from "./decide-fileable.js";
import { decideTrash } from "./decide-trash.js";
import { splitCommand } from "./split-command.js";
import { tailOutput } from "./tail-output.js";

describe("decideFileable", () => {
	it("refuses a note in the filing state that has an issue", () => {
		expect(decideFileable("---\nstatus: in-progress\nissue: '#9'\n---\n", "in-progress")).toEqual({
			ok: false,
			reason: "This idea is already filed as #9.",
		});
	});

	it("allows a note with the filing state and no issue, or an issue and another state", () => {
		expect(decideFileable("---\nstatus: in-progress\n---\n", "in-progress")).toEqual({ ok: true });
		expect(decideFileable("---\nstatus: seed\nissue: '#9'\n---\n", "in-progress")).toEqual({ ok: true });
		expect(decideFileable("no frontmatter", "in-progress")).toEqual({ ok: true });
	});
});

describe("decideTrash", () => {
	it("trashes a note that now has an issue", () => {
		expect(decideTrash("---\nstatus: in-progress\nissue: '#9'\n---\n", "")).toEqual({ trash: true, issue: "#9" });
	});

	it("keeps a note with no issue and passes on the output", () => {
		const kept = decideTrash("---\nstatus: in-progress\n---\n", "skipped: has an attachment");
		expect(kept.trash).toBe(false);
		expect((kept as { reason: string }).reason).toContain("skipped: has an attachment");
		expect((decideTrash("x", "") as { reason: string }).reason).toContain("printed nothing");
	});
});

describe("tailOutput", () => {
	it("keeps the last non-blank lines and strips colour codes", () => {
		expect(tailOutput("one\n\n\u001B[31mtwo\u001B[0m\r\nthree  \n", 2)).toBe("two\nthree");
	});

	it("drops the lines an interactive shell prints without a terminal, before taking the tail", () => {
		const output =
			"zsh: no job control in this shell\nbash: cannot set terminal process group (-1): Inappropriate ioctl for device\n" +
			"bash: no job control in this shell\nreal one\nreal two\n";
		expect(tailOutput(output, 2)).toBe("real one\nreal two");
		expect(tailOutput("zsh: can't access tty; job control turned off\nreal\n", 3)).toBe("real");
		expect(tailOutput("Job Control Turned Off\nCan't Access TTY\nreal\n", 3)).toBe("real");
		expect(tailOutput("real\nbash: no job control in this shell\n", 3)).toBe("real");
	});

	it("returns an empty string for no output", () => {
		expect(tailOutput("")).toBe("");
	});
});

describe("splitCommand", () => {
	it("splits on whitespace", () => {
		expect(splitCommand("pnpm  exec\tholocron")).toEqual(["pnpm", "exec", "holocron"]);
	});

	it("keeps a quoted path with spaces together, and an empty quoted word", () => {
		expect(splitCommand(`"/Applications/My Tools/pnpm" exec ''`)).toEqual([
			"/Applications/My Tools/pnpm",
			"exec",
			"",
		]);
	});

	it("returns no words for a blank command", () => {
		expect(splitCommand("   ")).toEqual([]);
	});
});
