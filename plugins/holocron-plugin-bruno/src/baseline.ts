import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { formatJson } from "./format-json.js";

/** Where the baseline sits, relative to the repo root. */
export const BASELINE_FILE = ".bruno/.sync.json";

/**
 * What the two sides of one pair looked like at the last sync: `sourceHash` is the hash of the request file as the
 * workspace could carry it, `workspaceHash` the hash of the workspace's own files. A side that is not equal to its
 * hash now has changed since.
 */
export interface BaselinePair {
	/** `collection` is a request collection and its folder; `environment` is one environment file. */
	kind: "collection" | "environment";
	/** The request file, relative to the repo root. */
	source: string;
	/** The folder (a collection) or the file (an environment), relative to `.bruno/`. */
	workspace: string;
	sourceHash: string;
	workspaceHash: string;
}

/** The committed record of the last sync. */
export interface Baseline {
	version: 1;
	pairs: BaselinePair[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Checks the shape of a parsed baseline; anything else is an error that names the file. */
function parseBaseline(value: unknown): Baseline {
	if (!isObject(value) || value.version !== 1 || !Array.isArray(value.pairs)) {
		throw new Error(
			`${BASELINE_FILE}: not a version 1 baseline; delete it to start again (the next sync rebuilds it)`
		);
	}
	const pairs = value.pairs.map((pair, index): BaselinePair => {
		const ok =
			isObject(pair) &&
			(pair.kind === "collection" || pair.kind === "environment") &&
			[pair.source, pair.workspace, pair.sourceHash, pair.workspaceHash].every((v) => typeof v === "string");
		if (!ok) throw new Error(`${BASELINE_FILE}: pair ${index + 1} is malformed; delete the file to start again`);
		return pair as unknown as BaselinePair;
	});
	return { version: 1, pairs };
}

/** The text of the baseline, pairs in a fixed order so a re-run changes nothing. */
export function serializeBaseline(pairs: BaselinePair[]): string {
	const sorted = [...pairs].sort((a, b) => (`${a.source}\0${a.workspace}` < `${b.source}\0${b.workspace}` ? -1 : 1));
	return formatJson({ version: 1, pairs: sorted });
}

/** The baseline and its text, or `undefined` when there is none yet. A damaged one is an error. */
export async function readBaseline(repoRoot: string): Promise<{ baseline: Baseline; text: string } | undefined> {
	let text: string;
	try {
		text = await readFile(join(repoRoot, BASELINE_FILE), "utf8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw err;
	}
	try {
		return { baseline: parseBaseline(JSON.parse(text) as unknown), text };
	} catch (err) {
		if ((err as Error).message.startsWith(BASELINE_FILE)) throw err;
		throw new Error(`${BASELINE_FILE}: ${(err as Error).message}; delete it to start again`, { cause: err });
	}
}
