import { join } from "node:path";

import { describeError } from "@theholocron/kyber/ui";

import type { Projects } from "../../../plugin/index.js";
import { createFsTemplatesIo } from "../fs-templates-io/index.js";
import { loadTemplates } from "../load-templates/index.js";
import { resolveProjectOptions } from "../project-options/index.js";
import type { BoardContextResult, OpenBoardContextInput } from "./board-context.type.js";

/**
 * The `projects` provider, the owner, the declared boards and the templates, in one place for `doctor project` and
 * `project move`. A missing provider is a `skip` with the reason (a provider that failed to load says why); options that
 * do not read are a `fail` with every problem.
 */
export async function openBoardContext(input: OpenBoardContextInput): Promise<BoardContextResult> {
	const { loaded, context, loader } = input;
	if (!loader.has("projects")) {
		const failure = loader.loadFailures().find((f) => f.key === "projects");
		return {
			ok: false,
			kind: "skip",
			reason: failure
				? `the \`${failure.provider}\` projects provider failed to load: ${describeError(failure.error)}`
				: "no `projects` provider is configured",
			problems: [],
		};
	}
	const entry = loaded.resolved.providers.projects;
	const options = entry && entry.cardinality === "single" ? entry.tuple.options : {};
	const parsed = resolveProjectOptions(options, loaded.resolved.org ?? context.org ?? "");
	if (!parsed.ok) {
		return {
			ok: false,
			kind: "fail",
			reason: "providers.projects options are not valid",
			problems: parsed.problems,
		};
	}
	const { owner, boards, templatesDir } = parsed.options;
	const { templates, problems } = await loadTemplates(
		join(context.repoRoot, templatesDir),
		input.io ?? createFsTemplatesIo(context.repoRoot)
	);
	return {
		ok: true,
		context: {
			projects: loader.get("projects") as Projects,
			owner,
			boards,
			templates,
			templateProblems: problems,
		},
	};
}
