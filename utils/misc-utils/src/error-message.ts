/**
 * Stringifies a caught value for display — `err.message` for a real
 * `Error`, `String(err)` for anything else (a thrown string, a plugin's
 * custom error-like object, …). `catch` blocks only ever get `unknown`
 * in TypeScript, so this is the one line nearly every one of them needs.
 */
export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
