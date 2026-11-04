import type { CallerJob, ParsedCaller } from "./doctor-ci.type.js";
import { parseList } from "./parse-list.js";
import { unquote } from "./unquote.js";

/**
 * Reads a generated thin caller: the top-level `name:`, each job under `jobs:` that has a `uses:` (its key and `name:`)
 * and the `expected` list of the `ci` aggregate. `undefined` for a file without the AUTO-GENERATED header or without a
 * job that calls a reusable workflow: a hand-written workflow, or a reusable itself. It reads the text the generator
 * writes, not arbitrary YAML.
 */
export function parseCaller(file: string, text: string): ParsedCaller | undefined {
	if (!text.split("\n", 3).some((line) => line.includes("AUTO-GENERATED"))) return undefined;
	const lines = text.split("\n");
	const start = lines.indexOf("jobs:");
	if (start === -1) return undefined;

	const jobs: CallerJob[] = [];
	let current: { id: string; name?: string; uses?: string } | undefined;
	const close = () => {
		if (current?.uses !== undefined) {
			jobs.push({
				id: current.id,
				uses: current.uses,
				...(current.name === undefined ? {} : { name: current.name }),
			});
		}
	};
	for (const line of lines.slice(start + 1)) {
		const key = /^ {2}([\w-]+):\s*$/.exec(line);
		if (key) {
			close();
			current = { id: key[1]! };
			continue;
		}
		const name = /^ {4}name:\s*(.+?)\s*$/.exec(line);
		if (name && current) current.name = unquote(name[1]!);
		const uses = /^ {4}uses:\s*(\S+)/.exec(line);
		if (uses && current) current.uses = uses[1]!;
	}
	close();
	if (jobs.length === 0) return undefined;

	const workflowName = /^name:\s*(.+?)\s*$/m.exec(text)?.[1];
	const expected = /^ {6}expected:\s*(.+?)\s*$/m.exec(text)?.[1];
	return {
		file,
		jobs,
		...(workflowName === undefined ? {} : { name: unquote(workflowName) }),
		...(expected === undefined ? {} : { expected: parseList(unquote(expected)) }),
	};
}
