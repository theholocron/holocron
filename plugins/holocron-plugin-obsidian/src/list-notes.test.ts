import { describe, expect, it } from "vitest";

import type { IdeasIo } from "./ideas-io.type.js";
import { listNotes } from "./list-notes.js";

/** A tree of folders: a string value is a file, an object a folder. */
type Tree = { [name: string]: string | Tree };

function ioFor(tree: Tree): IdeasIo {
	const at = (path: string): string | Tree | undefined =>
		path
			.split("/")
			.filter(Boolean)
			.reduce<string | Tree | undefined>(
				(node, part) => (typeof node === "object" ? node[part] : undefined),
				tree
			);
	return {
		readDir: (path) => {
			const node = at(path);
			return typeof node === "object"
				? Object.entries(node).map(([name, v]) => ({ name, directory: typeof v === "object" }))
				: undefined;
		},
		read: () => undefined,
		write: () => undefined,
		home: () => "/h",
	};
}

describe("listNotes", () => {
	it("lists Markdown notes recursively, sorted, relative to the folder", () => {
		const io = ioFor({ vault: { "b.md": "", "a.md": "", sub: { "c.md": "", "d.txt": "" }, "e.MD": "" } });
		expect(listNotes(io, "/vault")).toEqual(["a.md", "b.md", "e.MD", "sub/c.md"]);
	});

	it("does not enter a folder whose name starts with _ or .", () => {
		const io = ioFor({
			vault: {
				".obsidian": { "workspace.md": "" },
				".trash": { "gone.md": "" },
				_archive: { "old.md": "" },
				keep: { "x.md": "", _private: { "y.md": "" } },
				"top.md": "",
			},
		});
		expect(listNotes(io, "/vault")).toEqual(["keep/x.md", "top.md"]);
	});

	it("skips hidden files such as iCloud placeholders", () => {
		const io = ioFor({ vault: { ".note.md.icloud": "", ".hidden.md": "", "real.md": "" } });
		expect(listNotes(io, "/vault")).toEqual(["real.md"]);
	});

	it("is undefined when the folder cannot be read", () => {
		expect(listNotes(ioFor({}), "/missing")).toBeUndefined();
	});

	it("treats a subfolder that cannot be read as empty", () => {
		const io = ioFor({ vault: { sub: { "a.md": "" } } });
		const flaky: IdeasIo = { ...io, readDir: (p) => (p.endsWith("sub") ? undefined : io.readDir(p)) };
		expect(listNotes(flaky, "/vault")).toEqual([]);
	});
});
