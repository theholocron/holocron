import type { BranchEntry, ClassifiedBranch } from "./repo-cleanup-branches.type.js";

/**
 * One row per branch name and group: a branch on both sides that classifies the same on each is one entry
 * listing both places. A name whose two refs classify differently (the remote moved on) is two entries.
 * Newest first by local commit date; a remote-only branch has no date and follows, by name.
 */
export function groupBranches(classified: ClassifiedBranch[]): BranchEntry[] {
	const entries = new Map<string, BranchEntry>();
	for (const { ref, group, pr } of classified) {
		const key = `${group}:${ref.name}`;
		const entry = entries.get(key) ?? { name: ref.name, group, ...(pr === undefined ? {} : { pr }), locations: [] };
		entry.locations.push(ref.where);
		if (ref.date !== undefined && (entry.date === undefined || ref.date > entry.date)) entry.date = ref.date;
		entries.set(key, entry);
	}
	return [...entries.values()].sort(
		(a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.name.localeCompare(b.name)
	);
}
