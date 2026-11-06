/**
 * Whether an error is a raw "package isn't installed here" failure from `import()` or `require.resolve`:
 * `ERR_MODULE_NOT_FOUND` / `MODULE_NOT_FOUND`, or the "Cannot find package/module" message Node prints for it.
 */
export function isModuleNotFound(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	const code = (err as NodeJS.ErrnoException).code;
	if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") return true;
	return /Cannot find (?:package|module)|MODULE_NOT_FOUND/.test(err.message);
}
