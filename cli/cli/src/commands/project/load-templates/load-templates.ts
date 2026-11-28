import type { BoardTemplate } from "../../../plugin/index.js";
import { BUILTIN_TEMPLATES } from "../templates/builtin-templates/index.js";
import { resolveTemplate } from "../templates/resolve-template/resolve-template.js";
import { validateTemplateFile } from "../templates/validate-template/index.js";
import type { LoadedTemplates, TemplatesIo } from "./load-templates.type.js";

/**
 * Read the repo's own template files (`<name>.json` in `dir`) and add them to the built-ins. A file's name is the
 * template's name unless the file says another. A template may extend another of the repo's, whatever the order the files
 * are read in. A file that is not JSON, not a valid template, or extends something that does not exist is reported
 * with its name and left out, and the rest still load.
 */
export async function loadTemplates(dir: string, io: TemplatesIo): Promise<LoadedTemplates> {
	const templates: Record<string, BoardTemplate> = { ...BUILTIN_TEMPLATES };
	const problems: string[] = [];
	const pending: { file: string; name: string; parsed: ReturnType<typeof validateTemplateFile> & { ok: true } }[] =
		[];

	const names = (await io.listFiles(dir)).filter((f) => f.endsWith(".json")).sort();
	for (const file of names) {
		let value: unknown;
		try {
			value = JSON.parse(await io.readFile(`${dir}/${file}`));
		} catch {
			problems.push(`${file}: not valid JSON`);
			continue;
		}
		const parsed = validateTemplateFile(value);
		if (!parsed.ok) {
			problems.push(...parsed.problems.map((p) => `${file}: ${p}`));
			continue;
		}
		pending.push({ file, name: file.slice(0, -".json".length), parsed });
	}

	// Resolve until nothing more can be: a template that extends another of the repo's waits for it.
	let waiting = pending;
	for (let progress = true; progress && waiting.length > 0;) {
		progress = false;
		const next: typeof waiting = [];
		for (const item of waiting) {
			const base = item.parsed.file.extends;
			const blocked =
				base !== undefined && !templates[base] && waiting.some((w) => (w.parsed.file.name ?? w.name) === base);
			if (blocked) {
				next.push(item);
				continue;
			}
			const result = resolveTemplate(item.name, item.parsed.file, templates);
			if (result.ok) {
				templates[result.template.name] = result.template;
				progress = true;
			} else {
				problems.push(...result.problems.map((p) => `${item.file}: ${p}`));
				progress = true;
			}
		}
		waiting = next;
	}
	for (const item of waiting)
		problems.push(`${item.file}: extends "${item.parsed.file.extends}", which never resolves (a cycle)`);

	return { templates, problems };
}
