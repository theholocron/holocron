import { parseRepo } from "../repo.js";
import type { RestClient } from "@theholocron/cli";

export interface CanonicalLabel {
	readonly name: string;
	readonly color: string;
	readonly description: string;
}

interface RawLabel {
	name: string;
	color: string;
	description: string | null;
}

/**
 * Idempotently synchronise a repo's labels to the canonical set.
 *
 * - Creates labels that are missing.
 * - PATCHes labels whose color or description has drifted.
 * - DELETEs labels listed in `stale`.
 * - Leaves unrecognised labels that aren't in `stale` untouched.
 */
export async function syncLabels(
	rest: RestClient,
	repo: string,
	canonical: ReadonlyArray<CanonicalLabel>,
	stale: ReadonlyArray<string>
): Promise<string> {
	const { owner, name } = parseRepo(repo);
	const base = `/repos/${owner}/${name}`;

	const existing = await rest.request<RawLabel[]>(`${base}/labels?per_page=100`);
	const existingMap = new Map(existing.map((l) => [l.name, l]));

	let created = 0;
	let updated = 0;
	let deleted = 0;

	for (const label of canonical) {
		const current = existingMap.get(label.name);
		if (!current) {
			await rest.request(`${base}/labels`, {
				method: "POST",
				body: { name: label.name, color: label.color, description: label.description },
			});
			created++;
		} else if (current.color !== label.color || (current.description ?? "") !== label.description) {
			await rest.request(`${base}/labels/${encodeURIComponent(label.name)}`, {
				method: "PATCH",
				body: { color: label.color, description: label.description },
			});
			updated++;
		}
	}

	for (const staleName of stale) {
		if (existingMap.has(staleName)) {
			await rest.request(`${base}/labels/${encodeURIComponent(staleName)}`, {
				method: "DELETE",
			});
			deleted++;
		}
	}

	return `${created} created, ${updated} updated, ${deleted} deleted`;
}
