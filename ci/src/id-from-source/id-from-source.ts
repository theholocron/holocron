/** Everything up to and including the `workflows/` folder: `ci/workflows/`, `../workflows/` (how `src/index.ts` globs it) or a templates folder. */
const SOURCE_ROOT = /^(?:.*\/)?workflows\//;

/**
 * The task id a workflow source path stands for: the `ci/workflows/` prefix (or `../workflows/`, which is how
 * `src/index.ts` globs it) and the `.yml` suffix are dropped, and each folder separator becomes a colon, so
 * `ci/workflows/test/unit.yml` is `test:unit` and `ci/workflows/typecheck.yml` is `typecheck`. The folder is the
 * suite of a leaf; {@link workflowFile} gives the generated file name of the id.
 */
export function idFromSource(path: string): string {
	return path
		.replace(SOURCE_ROOT, "")
		.replace(/\.yml$/, "")
		.replaceAll("/", ":");
}
