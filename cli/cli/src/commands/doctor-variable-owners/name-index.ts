import type { NameHolders, NameSource } from "./doctor-variable-owners.type.js";

/** Every name across the places, folded to upper case as GitHub does, with the places that hold it. */
export function nameIndex(sources: NameSource[]): Map<string, NameHolders> {
	const index = new Map<string, NameHolders>();
	for (const source of sources) {
		for (const name of source.names) {
			const key = name.toUpperCase();
			const held = index.get(key) ?? { name, places: [] };
			if (!held.places.includes(source)) held.places.push(source);
			index.set(key, held);
		}
	}
	return index;
}
