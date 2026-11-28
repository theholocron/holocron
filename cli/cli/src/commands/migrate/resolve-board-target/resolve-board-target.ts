import { createFsTemplatesIo } from "../../project/fs-templates-io/index.js";
import { loadTemplates } from "../../project/load-templates/index.js";
import { resolveProjectOptions } from "../../project/project-options/index.js";
import type { BoardTarget, ResolveBoardTargetInput } from "./resolve-board-target.type.js";

/** The template a migrated board is made from unless `--template` names another. */
export const DEFAULT_BOARD_TEMPLATE = "roadmap";

/**
 * Settles the owner and the template for the board `migrate project` puts issues on. The owner and the template
 * directory come from `providers.projects` when the config sets them, the org otherwise; the template is a built-in or
 * one of the repo's own files, by name.
 */
export async function resolveBoardTarget(input: ResolveBoardTargetInput): Promise<BoardTarget> {
	const own = input.loaded.resolved.providers.projects;
	const parsed = resolveProjectOptions(own?.cardinality === "single" ? own.tuple.options : {}, input.fallbackOwner);
	if (!parsed.ok) return { ok: false, reason: `providers.projects: ${parsed.problems.join("; ")}` };
	const { templates } = await loadTemplates(
		parsed.options.templatesDir,
		input.io ?? createFsTemplatesIo(input.repoRoot)
	);
	const wanted = input.template ?? DEFAULT_BOARD_TEMPLATE;
	const template = templates[wanted];
	if (!template) {
		return {
			ok: false,
			reason: `no board template "${wanted}"; available: ${Object.keys(templates).sort().join(", ")}`,
		};
	}
	return { ok: true, owner: parsed.options.owner, template };
}
