import type { BuildSpecInput, BuiltSpec } from "./build-spec.type.js";

const FILED_FROM = /^Filed from idea:.*$/;
const MARKER = /^<!-- holocron:idea [^>]*-->$/;

/**
 * A draft spec from an issue: frontmatter (`status: draft`, the `issue`, no `blocked-by`, and no `id`, which
 * `specs sync` assigns), the title as the heading, and a `Problem` section holding the issue's text. The `Filed from
 * idea:` line and the hidden marker `ideas sync` appends are dropped, and so is a first `#` heading that repeats the
 * title. The text is laid out the way Prettier does (LF endings, one blank line between blocks, one final newline).
 */
export function buildSpec(input: BuildSpecInput): BuiltSpec {
	const lines = (input.body ?? "").replace(/\r\n?/g, "\n").split("\n");
	let fromIdea = false;
	const kept = lines.filter((line) => {
		const trimmed = line.trim();
		if (FILED_FROM.test(trimmed) || MARKER.test(trimmed)) {
			fromIdea = true;
			return false;
		}
		return true;
	});
	const first = kept.findIndex((line) => line.trim() !== "");
	if (first >= 0 && kept[first]!.trim() === `# ${input.title.trim()}`) kept.splice(first, 1);

	const problem = kept
		.map((line) => line.replace(/[ \t]+$/, ""))
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	const content = [
		"---",
		"status: draft",
		`issue: ${input.issue}`,
		"blocked-by: []",
		"---",
		"",
		`# ${input.title.trim()}`,
		"",
		"## Problem",
		...(problem ? ["", problem] : []),
		"",
	].join("\n");
	return { content, fromIdea };
}
