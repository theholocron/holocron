import type { BoardTemplate, BoardTemplateFile } from "../../../../plugin/index.js";
import type { ResolveTemplateResult } from "./resolve-template.type.js";

/** `base` with `added` merged in by name: an entry with the same name replaces the inherited one in place. */
function mergeByName<T extends { name: string }>(base: readonly T[], added: readonly T[] | undefined): T[] {
	const merged = [...base];
	for (const entry of added ?? []) {
		const at = merged.findIndex((existing) => existing.name === entry.name);
		if (at === -1) merged.push(entry);
		else merged[at] = entry;
	}
	return merged;
}

/**
 * Turn a template file into a whole {@link BoardTemplate}. With `extends` it starts from the named template (looked up
 * in `templates`, the built-ins and the repo's own) and merges the file's statuses, fields and views in by name, so an
 * entry the file repeats replaces the inherited one and the rest are kept; rules are added, and `source` is the file's
 * or the inherited one. Without `extends` the file must already be whole. `name` is the template's name when the file
 * does not say, which is its file name.
 */
export function resolveTemplate(
	name: string,
	file: BoardTemplateFile,
	templates: Readonly<Record<string, BoardTemplate>>
): ResolveTemplateResult {
	if (file.extends !== undefined) {
		const base = templates[file.extends];
		if (!base) {
			return { ok: false, problems: [`extends "${file.extends}": there is no template with that name`] };
		}
		if (file.extends === (file.name ?? name)) {
			return { ok: false, problems: [`"${file.extends}" cannot extend itself`] };
		}
		return {
			ok: true,
			template: {
				name: file.name ?? name,
				statuses: mergeByName(base.statuses, file.statuses),
				fields: mergeByName(base.fields, file.fields),
				views: mergeByName(base.views, file.views),
				rules: [...new Set([...(base.rules ?? []), ...(file.rules ?? [])])],
				source: file.source ?? base.source,
			},
		};
	}
	if (!file.statuses || !file.fields || !file.views) {
		return { ok: false, problems: ["a template without extends must list its statuses, fields and views"] };
	}
	return {
		ok: true,
		template: {
			name: file.name ?? name,
			statuses: file.statuses,
			fields: file.fields,
			views: file.views,
			rules: file.rules,
			source: file.source,
		},
	};
}
