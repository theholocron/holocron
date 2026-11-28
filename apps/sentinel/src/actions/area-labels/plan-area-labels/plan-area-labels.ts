import { AREA_PREFIX, areaLabelsForFiles, areaLabelsForTitle } from "@theholocron/cli";

import type { AreaLabelsPlan, PlanAreaLabelsInput } from "./plan-area-labels.type.js";

/** The most `area:` labels one item carries, counting the ones a person put there (spec `tech-github-area-labels`). */
export const MAX_AREA_LABELS = 4;

const lower = (names: readonly string[]): Set<string> => new Set(names.map((n) => n.toLowerCase()));

/**
 * The area labels to add to one item (spec `tech-github-area-labels`, rollout item 3). Pure, and add-only: a label
 * already on the item is never removed and never counted as a change, and a label the repository lacks is `missing`,
 * never made. A pull request's wanted labels are the areas of its files, the most-changed folder first (ties in
 * declaration order), then the areas its title's scopes add; an issue's are the title's. The labels already on the
 * item, a person's included, take their places under `MAX_AREA_LABELS` first, and the wanted ones that do not fit are
 * `dropped`, so a title cannot push out what the diff named. The comparison of names ignores case, as GitHub does.
 */
export function planAreaLabels(input: PlanAreaLabelsInput): AreaLabelsPlan {
	const wanted: string[] = [];
	if (input.files) {
		const perFile = input.files.map((file) => areaLabelsForFiles([file], input.areas));
		const changed = (label: string): number => perFile.filter((labels) => labels.includes(label)).length;
		wanted.push(...areaLabelsForFiles(input.files, input.areas).sort((a, b) => changed(b) - changed(a)));
	}
	for (const label of areaLabelsForTitle(input.title, input.scopes)) {
		if (!wanted.includes(label)) wanted.push(label);
	}

	const have = lower(input.existing);
	const known = lower(input.repoLabels);
	const prefix = AREA_PREFIX.toLowerCase();
	let room = MAX_AREA_LABELS - [...have].filter((n) => n.startsWith(prefix)).length;

	const plan: AreaLabelsPlan = { add: [], missing: [], dropped: [] };
	for (const label of wanted) {
		if (have.has(label.toLowerCase())) continue;
		if (!known.has(label.toLowerCase())) plan.missing.push(label);
		else if (room > 0) {
			plan.add.push(label);
			room--;
		} else plan.dropped.push(label);
	}
	return plan;
}
