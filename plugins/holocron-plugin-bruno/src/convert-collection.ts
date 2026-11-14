import { brunoToOpenCollection } from "@opencollection/converters";
import { postmanToBruno, postmanToBrunoEnvironment } from "@usebruno/converters";
import { dump } from "js-yaml";

/** What {@link convertCollection} produced. */
export interface ConvertedCollection {
	/** The OpenCollection document, as YAML. */
	text: string;
	/** What the converters reported they could not carry across, one line each. */
	issues: string[];
}

/** One line for a converter's issue, whatever shape it came in. */
const describeIssue = (issue: unknown): string => {
	if (typeof issue === "string") return issue;
	if (issue !== null && typeof issue === "object" && "message" in issue && typeof issue.message === "string") {
		return issue.message;
	}
	return JSON.stringify(issue);
};

/**
 * Converts one v2.1 collection (and the environments that go with it) to an OpenCollection YAML document: Bruno's
 * reader turns it into a Bruno collection and rewrites its `pm.*` scripts to `bru.*` / `req.*`, then the OpenCollection
 * converter lays that out, environments included (a secret-type variable becomes `transient`). Each environment is
 * given its `.bru` file name first, because that is where the OpenCollection converter takes its name from.
 */
export async function convertCollection(collection: unknown, environments: unknown[]): Promise<ConvertedCollection> {
	const read = await postmanToBruno(collection, { preserveScripts: false });
	const bruno = read.collection;
	const converted = await Promise.all(environments.map((env) => postmanToBrunoEnvironment(env)));
	if (converted.length > 0) bruno.environments = converted.map((env) => ({ ...env, filename: `${env.name}.bru` }));
	const text = dump(brunoToOpenCollection(bruno), { lineWidth: 120 });
	return { text, issues: (read.issues ?? []).map(describeIssue) };
}
