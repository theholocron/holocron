/**
 * The file name of the reusable workflow generated for a task id: a colon becomes a hyphen and `.yml` is added, so
 * `test:unit` is `test-unit.yml` and `typecheck` is `typecheck.yml`. GitHub reads only a flat `.github/workflows`, which
 * is why the grouped sources of `ci/workflows/` are flattened; {@link idFromSource} goes the other way.
 */
export function workflowFile(id: string): string {
	return `${id.replaceAll(":", "-")}.yml`;
}
