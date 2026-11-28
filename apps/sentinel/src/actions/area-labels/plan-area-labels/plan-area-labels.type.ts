import type { AreaLabelsConfig } from "../area-labels.type.js";

export interface PlanAreaLabelsInput extends AreaLabelsConfig {
	/** The paths a pull request changes (a renamed file's old path too); `undefined` for an issue, which has none. */
	files?: readonly string[];
	/** The item's title: its scopes name areas (a pull request's add to the ones its files name). */
	title: string;
	/** The labels the item already carries. */
	existing: readonly string[];
	/** The names of the labels the repository has. */
	repoLabels: readonly string[];
}

export interface AreaLabelsPlan {
	/** Labels to add, at most `MAX_AREA_LABELS` area labels on the item in all. */
	add: string[];
	/** Labels the rules want that the repository does not have: reported, never made. */
	missing: string[];
	/** Labels the rules want that the cap left out. */
	dropped: string[];
}
