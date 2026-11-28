import type { DocSymbol, TypedocComment, TypedocReflection } from "./docs-coverage.type.js";

/** TypeDoc's `ReflectionKind` numbers for the kinds that should be documented, by name. */
const KINDS: Record<number, string> = {
	8: "Enum",
	32: "Variable",
	64: "Function",
	128: "Class",
	256: "Interface",
	1024: "Property",
	2048: "Method",
	262144: "Accessor",
	2097152: "TypeAlias",
};

/** A path inside a `dist/` folder: compiled output, not a package's own source. */
const BUILD_OUTPUT = /(^|\/)dist\//;

function hasComment(comment: TypedocComment | undefined): boolean {
	return Boolean(comment?.summary?.length || comment?.blockTags?.length);
}

function isDocumented(r: TypedocReflection): boolean {
	return (
		hasComment(r.comment) ||
		(r.signatures ?? []).some((s) => hasComment(s.comment)) ||
		hasComment(r.getSignature?.comment) ||
		hasComment(r.setSignature?.comment)
	);
}

/**
 * The symbols a package exports that should carry a doc comment, from TypeDoc's JSON model: functions, classes,
 * interfaces, type aliases, variables, enums, and the public members of those. Private, inherited and external
 * members are not counted, nor is a symbol whose source is a build output (`dist/`): a package that re-exports another
 * one sees that package's compiled declarations, which lose the member comments the source has, and the symbol is
 * measured in its own package. `fallbackFile` stands in for a symbol TypeDoc gives no source for.
 */
export function countSymbols(children: TypedocReflection[] | undefined, fallbackFile: string): DocSymbol[] {
	const out: DocSymbol[] = [];
	const walk = (r: TypedocReflection): void => {
		const kind = KINDS[r.kind];
		const source = r.sources?.[0] ?? r.signatures?.[0]?.sources?.[0];
		if (source && BUILD_OUTPUT.test(source.fileName)) return;
		if (kind && !r.flags?.isPrivate && !r.flags?.isExternal && !r.inheritedFrom) {
			out.push({
				kind,
				name: r.name,
				file: source?.fileName ?? fallbackFile,
				line: source?.line ?? 1,
				documented: isDocumented(r),
			});
		}
		for (const child of r.children ?? []) walk(child);
		for (const child of r.type?.declaration?.children ?? []) walk(child);
	};
	for (const child of children ?? []) walk(child);
	return out;
}
