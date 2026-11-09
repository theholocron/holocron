import { basename, isAbsolute, join } from "node:path";

import type { IdeaRecord, Ideas } from "@theholocron/cli";

import type { IdeasIo } from "../ideas-io.type.js";
import { listNotes } from "../list-notes.js";
import { parseNote } from "../parse-note.js";
import { resolveIdeasDir } from "../resolve-ideas-dir.js";
import { writeProperty } from "../write-property.js";

/** Options for the Obsidian `ideas` provider. */
export interface ObsidianIdeasOptions {
	/**
	 * The folder of notes (an Obsidian vault). May start with `~` for the home folder. `HOLOCRON_IDEAS_DIR` overrides
	 * it, since the path differs per machine.
	 */
	dir?: string;
	/** The environment `HOLOCRON_IDEAS_DIR` is read from. Defaults to `process.env`. */
	env?: Record<string, string | undefined>;
	/** The disk. Defaults to the real one; a test supplies a fake. */
	io?: IdeasIo;
}

/**
 * The Obsidian implementation of the `ideas` capability: every Markdown note under the vault folder is an idea, its
 * `status:` and `issue:` properties are its state and the issue it was filed as, and its key is its path relative to
 * the folder. It reads and writes files only: no token, no network. It does not implement `retire`, because
 * Obsidian's trash is reachable only through the app.
 */
export class ObsidianIdeas implements Ideas {
	/** The capability this class provides, always `"ideas"`. */
	readonly key = "ideas" as const;
	/** The provider name, `"obsidian"`. */
	readonly providerName = "obsidian";

	constructor(
		private readonly options: ObsidianIdeasOptions,
		private readonly io: IdeasIo
	) {}

	/** Every note in the folder as an idea, sorted by path; a note that cannot be read comes back with an `error`. */
	async list(): Promise<IdeaRecord[]> {
		const dir = this.dir();
		const paths = listNotes(this.io, dir);
		if (!paths) throw new Error(`the notes folder does not exist or cannot be read: ${dir}`);
		return paths.map((path) => {
			const text = this.io.read(join(dir, path));
			const fileName = basename(path);
			if (text === undefined) {
				return { key: path, title: fileName, body: "", status: "", attachments: [], error: "cannot be read" };
			}
			const note = parseNote(text, fileName);
			return {
				key: path,
				title: note.title,
				body: note.body,
				status: note.status,
				...(note.issue === "" ? {} : { issue: note.issue }),
				attachments: note.attachments,
			};
		});
	}

	/** Sets the note's `status:` property; the rest of the file stays as it was, byte for byte. */
	async setStatus(key: string, status: string): Promise<void> {
		this.patch(key, "status", status);
	}

	/** Sets the note's `issue:` property, read again first because a sync client may have changed the note. */
	async markFiled(key: string, issue: string): Promise<void> {
		this.patch(key, "issue", issue);
	}

	private dir(): string {
		const dir = resolveIdeasDir(this.options.dir, this.io.home(), this.options.env);
		if (!dir) {
			throw new Error(
				'no notes folder: set `dir` on the `ideas` provider (`providers.ideas: ["obsidian", { dir }]`) or HOLOCRON_IDEAS_DIR'
			);
		}
		return dir;
	}

	private patch(key: string, name: "status" | "issue", value: string): void {
		if (isAbsolute(key) || key.split("/").includes("..")) {
			throw new Error(`"${key}" is not a path inside the notes folder`);
		}
		const path = join(this.dir(), key);
		const text = this.io.read(path);
		if (text === undefined) throw new Error("the note can no longer be read");
		const next = writeProperty(text, name, value);
		if (parseNote(next, basename(key))[name] !== value) {
			throw new Error(`the note has no frontmatter to hold \`${name}:\``);
		}
		if (next !== text) this.io.write(path, next);
	}
}
