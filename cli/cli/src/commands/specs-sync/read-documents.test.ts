import { describe, expect, it } from "vitest";

import { readDocuments } from "./read-documents.js";
import type { SpecsSyncIo } from "./specs-sync.type.js";

/** An in-memory repo: path to text. A folder is the files that start with `<dir>/` and have no further `/`. */
function makeIo(files: Record<string, string>): SpecsSyncIo {
	return {
		list: (dir) =>
			Object.keys(files)
				.filter((f) => f.startsWith(`${dir}/`) && !f.slice(dir.length + 1).includes("/"))
				.map((f) => f.slice(dir.length + 1)),
		read: (path) => files[path],
		write: () => {},
		origin: () => undefined,
	};
}

describe("readDocuments", () => {
	it("reads the ADRs and the specs in both spec folders, in path order, with their kind", () => {
		const docs = readDocuments(
			makeIo({
				"docs/wiki/specifications/z.spec.md": "z",
				".notes/b.spec.md": "b",
				"docs/wiki/decisions/0001-x.md": "adr",
				".notes/a.spec.md": "a",
			})
		);

		expect(docs.map((d) => [d.path, d.kind])).toEqual([
			[".notes/a.spec.md", "spec"],
			[".notes/b.spec.md", "spec"],
			["docs/wiki/decisions/0001-x.md", "adr"],
			["docs/wiki/specifications/z.spec.md", "spec"],
		]);
		expect(docs[0]?.text).toBe("a");
	});

	it("leaves out what is neither: the template, the readmes and other files", () => {
		const docs = readDocuments(
			makeIo({
				"docs/wiki/decisions/template.md": "t",
				"docs/wiki/decisions/README.md": "r",
				".notes/README.md": "r",
				".notes/old.spec.md.orig": "o",
				".notes/a.spec.md": "a",
			})
		);

		expect(docs.map((d) => d.path)).toEqual([".notes/a.spec.md"]);
	});

	it("leaves out a file that cannot be read", () => {
		const io = makeIo({ ".notes/a.spec.md": "a", ".notes/b.spec.md": "b" });
		const unreadable: SpecsSyncIo = { ...io, read: (p) => (p.endsWith("b.spec.md") ? undefined : io.read(p)) };

		expect(readDocuments(unreadable).map((d) => d.path)).toEqual([".notes/a.spec.md"]);
	});

	it("is empty for a repo with none of the folders", () => {
		expect(readDocuments(makeIo({}))).toEqual([]);
	});
});
