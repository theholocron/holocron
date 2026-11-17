import { postmanToBruno, postmanToBrunoEnvironment } from "@usebruno/converters";

import { describeIssue } from "./describe-issue.js";
import { repairSigningBody } from "./repair-signing-body.js";

/** What {@link convertCollection} produced. */
export interface ConvertedCollection {
	/** The collection as one Bruno JSON file, environments inside, which Bruno's collection import reads. */
	json: string;
	/** What the converters reported they could not carry across, one line each. */
	issues: string[];
}

/** The collection as Bruno's own JSON export lays it out: one file, with the environments inside it. */
function brunoJson(bruno: { name?: string; environments?: unknown[] } & Record<string, unknown>): string {
	const environments = ((bruno.environments ?? []) as Record<string, unknown>[]).map(
		({ filename: _filename, ...env }) => env
	);
	const exported = {
		name: bruno.name,
		version: "1",
		items: bruno.items,
		environments,
		root: bruno.root,
		brunoConfig: { version: "1", name: bruno.name, type: "collection", ignore: ["node_modules", ".git"] },
	};
	return `${JSON.stringify(exported, null, 2)}\n`;
}

/**
 * Converts one v2.1 collection (and the environments that go with it) to Bruno's own JSON export: Bruno's reader turns
 * it into a Bruno collection and rewrites its `pm.*` scripts to `bru.*` / `req.*`, and the environments go inside the
 * file (a secret-type variable is marked `secret`).
 */
export async function convertCollection(collection: unknown, environments: unknown[]): Promise<ConvertedCollection> {
	const read = await postmanToBruno(collection, { preserveScripts: false });
	const bruno = read.collection;
	repairSigningBody(bruno);
	const converted = await Promise.all(environments.map((env) => postmanToBrunoEnvironment(env)));
	if (converted.length > 0) bruno.environments = converted;
	return { json: brunoJson(bruno), issues: (read.issues ?? []).map(describeIssue) };
}
