import type { GitHubClient, GitHubLabel } from "@theholocron/github-client";

/** A label the repo is expected to have. */
export interface CanonicalLabel {
	/** The label's name. */
	readonly name: string;
	/** The label's color, as a hex string. */
	readonly color: string;
	/** The label's description. */
	readonly description: string;
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
	client: GitHubClient,
	repo: string,
	canonical: ReadonlyArray<CanonicalLabel>,
	stale: ReadonlyArray<string>
): Promise<string> {
	const existing: GitHubLabel[] = await client.labels.listLabels(repo);
	const existingMap = new Map(existing.map((l) => [l.name.toLowerCase(), l]));

	let created = 0;
	let updated = 0;
	let deleted = 0;

	for (const label of canonical) {
		const current = existingMap.get(label.name);
		if (!current) {
			await client.labels.createLabel(repo, {
				name: label.name,
				color: label.color,
				description: label.description,
			});
			created++;
		} else if (current.color !== label.color || (current.description ?? "") !== label.description) {
			await client.labels.updateLabel(repo, label.name, {
				color: label.color,
				description: label.description,
			});
			updated++;
		}
	}

	for (const staleName of stale) {
		if (existingMap.has(staleName)) {
			await client.labels.deleteLabel(repo, staleName);
			deleted++;
		}
	}

	return `${created} created, ${updated} updated, ${deleted} deleted`;
}
