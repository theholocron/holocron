import type { NameHolders, NameSource, SyncFeed } from "./doctor-variable-owners.type.js";
import { nameIndex } from "./name-index.js";

/**
 * The names that live in more than one place, sorted by name. A name is left out when `shared` lists it (deliberate sharing),
 * and a GitHub copy is not counted when an Environment that holds the name fills it through a sync entry (`feeds`):
 * that is the one allowed path. Places of one group count once, so the instances of one App never clash.
 *
 * @param sources - What each place holds.
 * @param feeds - `repo.secrets.sync` and `repo.variables.sync`, as {@link SyncFeed}s.
 * @param shared - `doctor.sharedVariables`.
 */
export function findDuplicates(sources: NameSource[], feeds: SyncFeed[], shared: string[]): NameHolders[] {
	const allowed = new Set(shared.map((name) => name.toUpperCase()));
	const found: NameHolders[] = [];
	for (const [key, holders] of [...nameIndex(sources)].sort(([a], [b]) => (a < b ? -1 : 1))) {
		if (allowed.has(key)) continue;
		const filled = (place: NameSource): boolean =>
			place.feed !== undefined &&
			feeds.some(
				(feed) =>
					feed.target === place.feed &&
					(feed.keys === undefined || feed.keys.some((k) => k.toUpperCase() === key)) &&
					holders.places.some((other) => other.environment === feed.environment)
			);
		const places = holders.places.filter((place) => !filled(place));
		if (new Set(places.map((place) => place.group)).size > 1) found.push({ name: holders.name, places });
	}
	return found;
}
