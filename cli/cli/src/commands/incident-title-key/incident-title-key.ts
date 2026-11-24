/**
 * The form of an incident title that two titles are compared in: trimmed, lower case, runs of whitespace one space.
 * `new incident` refuses to open a second incident whose key equals an open one's (spec
 * `tech-open-status-page-incidents`), so a rerun after a timeout never opens two.
 */
export function incidentTitleKey(title: string): string {
	return title.trim().toLowerCase().replace(/\s+/g, " ");
}
