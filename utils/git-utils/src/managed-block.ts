import { randomBytes } from "node:crypto";
import { chmod, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** The markers and content of a block managed inside a text file. */
export interface ManagedBlockOptions {
	/** The line that opens the block, e.g. `# managed by my-tool — skills`. Matched as text, so it must be distinctive. */
	start: string;
	/** The line that closes the block. */
	end: string;
	/** What goes between the markers, one entry per line. No blank lines, and no line breaks inside an entry. */
	lines: readonly string[];
}

/** A blank (or whitespace-only) line: the boundary of a block whose end marker went missing. */
const BLANK_LINE = /\r?\n[ \t]*\r?\n/;

/** `\r\n` when it is the text's majority line ending, else `\n`. */
function detectEol(text: string): "\n" | "\r\n" {
	const crlf = text.match(/\r\n/g)?.length ?? 0;
	const lf = (text.match(/\n/g)?.length ?? 0) - crlf;
	return crlf > lf ? "\r\n" : "\n";
}

/**
 * Inserts or replaces a block of lines delimited by marker lines, leaving
 * everything outside it untouched.
 *
 * - Block present (`start` … `end`): replaced in place.
 * - No block: appended, separated from existing content by a blank line, with a
 *   single trailing newline.
 * - `start` present but `end` missing (hand-edited or truncated): the block is
 *   taken to run to the next blank line, or to the end of the file — so the
 *   content after it is kept, not lost. An `end` marker only closes the block
 *   when it comes before that blank line; one further down is left alone.
 *
 * Line endings follow the existing text (`\r\n` when it mostly uses them), so
 * a CRLF file stays CRLF. That is also why `lines` can't contain blank lines: a
 * blank line is how an unterminated block is told apart from the next section.
 *
 * Idempotent: calling it again with the same options returns the same text.
 * There are no default markers; callers choose them, and must keep them stable
 * so existing blocks are still found.
 *
 * @throws {TypeError} when an entry in `lines` is blank or contains a line break.
 */
export function upsertManagedBlock(content: string, { start, end, lines }: ManagedBlockOptions): string {
	for (const line of lines) {
		if (line.trim() === "" || /[\r\n]/.test(line)) {
			throw new TypeError(`Managed block lines must be non-blank single lines, got ${JSON.stringify(line)}`);
		}
	}
	const eol = detectEol(content);
	const block = [start, ...lines, end].join(eol);
	const startAt = content.indexOf(start);
	if (startAt === -1) {
		const base = content.trimEnd();
		return (base ? `${base}${eol}${eol}` : "") + `${block}${eol}`;
	}
	const boundary = BLANK_LINE.exec(content.slice(startAt));
	const boundaryAt = boundary ? startAt + boundary.index : -1;
	const endAt = content.indexOf(end, startAt);
	if (endAt !== -1 && (boundaryAt === -1 || endAt < boundaryAt)) {
		return content.slice(0, startAt) + block + content.slice(endAt + end.length);
	}
	return content.slice(0, startAt) + block + (boundaryAt === -1 ? eol : content.slice(boundaryAt));
}

/** Updates in flight, per file: a second call for the same path waits for the first. */
const queues = new Map<string, Promise<unknown>>();

function serialized<T>(key: string, task: () => Promise<T>): Promise<T> {
	const result = (queues.get(key) ?? Promise.resolve()).then(task, task);
	const tail = result.catch(() => undefined);
	queues.set(key, tail);
	void tail.then(() => {
		if (queues.get(key) === tail) queues.delete(key);
	});
	return result;
}

async function readIfExists(path: string): Promise<string> {
	try {
		return await readFile(path, "utf8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
		throw err;
	}
}

/** Writes `path` by renaming a finished temp file over it, so a failure never leaves it truncated. */
async function writeAtomic(path: string, text: string): Promise<void> {
	const mode = await stat(path).then(
		(s) => s.mode & 0o777,
		() => undefined
	);
	const tmp = join(dirname(path), `.${randomBytes(6).toString("hex")}.tmp`);
	try {
		await writeFile(tmp, text, "utf8");
		if (mode !== undefined) await chmod(tmp, mode);
		await rename(tmp, path);
	} catch (err) {
		await unlink(tmp).catch(() => undefined);
		throw err;
	}
}

/**
 * {@link upsertManagedBlock} applied to a file (a missing file counts as empty,
 * and is created). Writes only when the content changes, and atomically (a
 * temp file renamed into place; a symlinked path is updated through the link).
 * Resolves to `true` when it wrote.
 *
 * Calls for the same path within one process run one after another, each
 * reading the file as the previous left it. Separate processes aren't
 * coordinated. Any read error other than "no such file" rejects, rather than
 * being mistaken for an empty file and overwritten.
 */
export async function updateGitignore(path: string, options: ManagedBlockOptions): Promise<boolean> {
	const target = await realpath(path).catch(() => path);
	return serialized(target, async () => {
		const existing = await readIfExists(target);
		const updated = upsertManagedBlock(existing, options);
		if (updated === existing) return false;
		await writeAtomic(target, updated);
		return true;
	});
}
