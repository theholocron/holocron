import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { IdeasIo } from "../ideas-io.type.js";
import { realIdeasIo } from "../real-ideas-io.js";
import { ObsidianIdeas, type ObsidianIdeasOptions } from "./ideas.js";

const READY = "---\nstatus: in-progress\ntags: [a]\n---\n\n# Add a thing\n\nWe should add a thing.\n";

/** An in-memory vault: path (relative to /vault) to text. Folders come from the paths. */
function memoryIo(files: Record<string, string>, over: Partial<IdeasIo> = {}) {
	const disk = { ...files };
	const writes: string[] = [];
	const io: IdeasIo = {
		readDir: (path) => {
			if (path !== "/vault" && !path.startsWith("/vault/")) return undefined;
			const prefix = path === "/vault" ? "" : path.replace("/vault/", "") + "/";
			const names = new Map<string, boolean>();
			for (const p of Object.keys(disk)) {
				if (!p.startsWith(prefix)) continue;
				const [first, ...rest] = p.slice(prefix.length).split("/");
				names.set(first!, rest.length > 0);
			}
			return [...names].map(([name, directory]) => ({ name, directory }));
		},
		read: (path) => disk[path.replace("/vault/", "")],
		write: (path, text) => {
			writes.push(path);
			disk[path.replace("/vault/", "")] = text;
		},
		home: () => "/home/leia",
		...over,
	};
	return { io, disk, writes };
}

const provider = (io: IdeasIo, options: ObsidianIdeasOptions = { dir: "/vault", env: {} }) =>
	new ObsidianIdeas({ env: {}, ...options }, io);

describe("ObsidianIdeas", () => {
	it("is the ideas capability of the obsidian provider, and does not retire", () => {
		const ideas = provider(memoryIo({}).io);
		expect(ideas.key).toBe("ideas");
		expect(ideas.providerName).toBe("obsidian");
		expect("retire" in ideas).toBe(false);
	});

	describe("list", () => {
		it("returns every note as a record keyed by its path, sorted", async () => {
			const { io } = memoryIo({
				"b.md": "---\nstatus: seed\nissue: #4\n---\n# B\n",
				"sub/a.md": READY,
				"nofront.md": "just text\n",
			});
			expect(await provider(io).list()).toEqual([
				{ key: "b.md", title: "B", body: "# B\n", status: "seed", issue: "#4", attachments: [] },
				{ key: "nofront.md", title: "nofront", body: "just text\n", status: "", attachments: [] },
				{
					key: "sub/a.md",
					title: "Add a thing",
					body: "\n# Add a thing\n\nWe should add a thing.\n",
					status: "in-progress",
					attachments: [],
				},
			]);
		});

		it("skips folders that start with _ or .", async () => {
			const { io } = memoryIo({
				"_templates/t.md": READY,
				".trash/x.md": READY,
				".obsidian/y.md": READY,
				"ok.md": READY,
			});
			expect((await provider(io).list()).map((r) => r.key)).toEqual(["ok.md"]);
		});

		it("reports embedded files and notes as attachments, not web images or fenced ones", async () => {
			const { io } = memoryIo({
				"n.md": "---\nstatus: x\n---\n![[photo.png]]\n![[other note]]\n![a](assets/a.png)\n![w](https://x.dev/a.png)\n```\n![[fenced]]\n```\n",
			});
			const [record] = await provider(io).list();
			expect(record!.attachments).toEqual(["![[photo.png]]", "![[other note]]", "![a](assets/a.png)"]);
		});

		it("returns a record with an error for a note that cannot be read, and goes on", async () => {
			const { io, disk } = memoryIo({ "a.md": READY, "b.md": READY });
			const flaky: IdeasIo = {
				...io,
				read: (p) => (p.endsWith("a.md") ? undefined : disk[p.replace("/vault/", "")]),
			};
			const records = await provider(flaky).list();
			expect(records[0]).toEqual({
				key: "a.md",
				title: "a.md",
				body: "",
				status: "",
				attachments: [],
				error: "cannot be read",
			});
			expect(records[1]!.status).toBe("in-progress");
		});

		it("throws when the folder cannot be read, naming it", async () => {
			const { io } = memoryIo({});
			const err = await provider({ ...io, readDir: () => undefined }, { dir: "/nowhere" })
				.list()
				.catch((e: unknown) => e);
			expect((err as Error).message).toBe("the notes folder does not exist or cannot be read: /nowhere");
		});

		it("names the iCloud folder it built from `vault` when that folder is missing", async () => {
			const { io } = memoryIo({});
			const err = await provider({ ...io, readDir: () => undefined }, { vault: "The Holocron" })
				.list()
				.catch((e: unknown) => e);
			expect((err as Error).message).toBe(
				"the notes folder does not exist or cannot be read: /home/leia/Library/Mobile Documents/iCloud~md~obsidian/Documents/The Holocron"
			);
		});

		it("throws a clear message when no folder is configured", async () => {
			const err = await provider(memoryIo({}).io, {})
				.list()
				.catch((e: unknown) => e);
			expect((err as Error).message).toContain("no notes folder");
			expect((err as Error).message).toContain("HOLOCRON_IDEAS_DIR");
		});

		it("reads the folder from HOLOCRON_IDEAS_DIR over the option, and expands ~", async () => {
			const seen: string[] = [];
			const io: IdeasIo = {
				readDir: (p) => (seen.push(p), []),
				read: () => undefined,
				write: () => undefined,
				home: () => "/home/leia",
			};
			await provider(io, { dir: "/ignored", env: { HOLOCRON_IDEAS_DIR: "~/Notes" } }).list();
			await provider(io, { dir: "~/Vault", env: {} }).list();
			expect(seen).toEqual(["/home/leia/Notes", "/home/leia/Vault"]);
		});
	});

	describe("markFiled", () => {
		it("writes issue: and leaves the rest of the file byte for byte", async () => {
			const { io, disk } = memoryIo({ "idea.md": READY });
			await provider(io).markFiled("idea.md", "#101");
			expect(disk["idea.md"]).toBe(READY.replace("tags: [a]\n", "tags: [a]\nissue: #101\n"));
		});

		it("keeps CRLF line endings", async () => {
			const { io, disk } = memoryIo({ "idea.md": "---\r\nstatus: in-progress\r\n---\r\nbody\r\n" });
			await provider(io).markFiled("idea.md", "ENG-42");
			expect(disk["idea.md"]).toBe("---\r\nstatus: in-progress\r\nissue: ENG-42\r\n---\r\nbody\r\n");
		});

		it("writes nothing when the note already says so", async () => {
			const { io, writes } = memoryIo({ "idea.md": "---\nstatus: x\nissue: #5\n---\n" });
			await provider(io).markFiled("idea.md", "#5");
			expect(writes).toEqual([]);
		});

		it("fails when the note can no longer be read", async () => {
			const { io } = memoryIo({});
			const err = await provider(io)
				.markFiled("gone.md", "#1")
				.catch((e: unknown) => e);
			expect((err as Error).message).toContain("can no longer be read");
		});

		it("fails for a note with no frontmatter to hold the property, and writes nothing", async () => {
			const { io, writes } = memoryIo({ "plain.md": "# Plain\n" });
			const err = await provider(io)
				.markFiled("plain.md", "#1")
				.catch((e: unknown) => e);
			expect((err as Error).message).toContain("no frontmatter to hold `issue:`");
			expect(writes).toEqual([]);
		});

		it("passes a write error up", async () => {
			const { io } = memoryIo(
				{ "a.md": READY },
				{
					write: () => {
						throw new Error("read-only");
					},
				}
			);
			const err = await provider(io)
				.markFiled("a.md", "#1")
				.catch((e: unknown) => e);
			expect((err as Error).message).toBe("read-only");
		});

		it.each(["../escape.md", "/etc/passwd", "a/../../b.md"])(
			"refuses the key %s, which leaves the folder",
			async (key) => {
				const { io, writes } = memoryIo({ "a.md": READY });
				const err = await provider(io)
					.markFiled(key, "#1")
					.catch((e: unknown) => e);
				expect((err as Error).message).toContain("is not a path inside the notes folder");
				expect(writes).toEqual([]);
			}
		);
	});

	describe("setStatus", () => {
		it("sets status: in place", async () => {
			const { io, disk } = memoryIo({ "idea.md": READY });
			await provider(io).setStatus("idea.md", "dropped");
			expect(disk["idea.md"]).toBe(READY.replace("in-progress", "dropped"));
		});
	});

	describe("on a real disk", () => {
		const made: string[] = [];
		afterEach(() => {
			for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
		});

		it("lists, files and sets a status in a temporary folder", async () => {
			const dir = mkdtempSync(join(tmpdir(), "holocron-obsidian-"));
			made.push(dir);
			mkdirSync(join(dir, "sub"));
			mkdirSync(join(dir, ".obsidian"));
			writeFileSync(join(dir, "sub", "idea.md"), READY);
			writeFileSync(join(dir, ".obsidian", "app.md"), READY);
			const ideas = new ObsidianIdeas({ dir, env: {} }, realIdeasIo());
			expect((await ideas.list()).map((r) => r.key)).toEqual(["sub/idea.md"]);
			await ideas.markFiled("sub/idea.md", "#9");
			await ideas.setStatus("sub/idea.md", "exploring");
			expect(readFileSync(join(dir, "sub", "idea.md"), "utf8")).toBe(
				"---\nstatus: exploring\ntags: [a]\nissue: #9\n---\n\n# Add a thing\n\nWe should add a thing.\n"
			);
			const missing = new ObsidianIdeas({ dir: join(dir, "missing"), env: {} }, realIdeasIo());
			await expect(missing.list()).rejects.toThrow("does not exist");
			expect(ideasHome()).toBeTruthy();
		});
	});
});

function ideasHome(): string {
	return realIdeasIo().home();
}
