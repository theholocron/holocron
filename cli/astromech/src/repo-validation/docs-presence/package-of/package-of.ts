/**
 * The public package a changed file is source of: the nearest folder above it with a `package.json`, when the file is
 * under that package's `src/` or is its root `index`, and the package is not private. Tests, other package files and
 * files in no package give `undefined`.
 */
export function packageOf(
	file: string,
	readPackage: (dir: string) => { private?: boolean } | undefined
): string | undefined {
	if (file.includes("node_modules/") || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) return undefined;
	const parts = file.split("/");
	for (let i = parts.length - 1; i > 0; i--) {
		const dir = parts.slice(0, i).join("/");
		const pkg = readPackage(dir);
		if (!pkg) continue;
		if (pkg.private) return undefined;
		const inside = parts.slice(i).join("/");
		return inside.startsWith("src/") || /^index\.[cm]?[jt]s$/.test(inside) ? dir : undefined;
	}
	return undefined;
}
