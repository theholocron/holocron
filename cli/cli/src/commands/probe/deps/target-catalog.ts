/** Where a third-party dependency belongs, from the groups that use it (peers do not count). */
export function targetCatalog(groups: ReadonlySet<string>): string {
	const real = [...groups].filter((g) => g !== "root");
	if (groups.size > 1 && real.length !== 1) return "default";
	if (real.length === 1 && groups.size === 1) return real[0] as string;
	return "default";
}
