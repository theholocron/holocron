/**
 * The reference a Bruno environment uses to read a value from the collection's `.env` file: `{{process.env.NAME}}`.
 *
 * Bruno's file format keeps no value for a secret variable (its own store holds that), so a reference cannot sit on one.
 * The workspace therefore writes a configured secret as a plain variable whose value is the reference, and reads such a
 * variable back as the secret it came from, so the request files (shared with other tools) keep a blank secret.
 */

import { parseEnvironment, stringifyEnvironment } from "@usebruno/filestore";

const REFERENCE = /^\{\{\s*process\.env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/;

/** The reference to the entry `name`. */
export const referenceTo = (name: string): string => `{{process.env.${name}}}`;

/** The entry name a value refers to, or `undefined` when the value is not exactly one reference. */
export function referencedName(value: string | undefined): string | undefined {
	return value === undefined ? undefined : REFERENCE.exec(value.trim())?.[1];
}

/** The part of a Bruno environment variable this reads and writes. */
interface EnvironmentVariable {
	name: string;
	value?: string | undefined;
	secret?: boolean | undefined;
}

/**
 * The environment with each secret variable named in `refs` (variable name to entry name) made a plain variable whose
 * value is the reference to its entry. Everything else is left as it was.
 */
export function withSecretReferences<T extends { variables?: unknown[] | undefined }>(
	environment: T,
	refs: Record<string, string> | undefined
): T {
	if (!refs || !environment.variables) return environment;
	return {
		...environment,
		variables: (environment.variables as EnvironmentVariable[]).map((variable) => {
			const entry = variable.secret ? refs[variable.name] : undefined;
			return entry === undefined ? variable : { ...variable, secret: false, value: referenceTo(entry) };
		}),
	};
}

/**
 * The text of a workspace environment file with each secret variable named in `refs` made a reference, as
 * {@link withSecretReferences} does for a generated one: for a file that is already written, whose secrets
 * `sync requests` would otherwise find in step and leave blank. A file with nothing to change comes back as it is,
 * byte for byte, so Bruno's own layout is never rewritten for nothing.
 */
export function healReferences(text: string, refs: Record<string, string> | undefined): string {
	if (!refs) return text;
	const environment = parseEnvironment(text, { format: "yml" });
	// Bruno's reader always gives a list, empty for a file with none.
	const wanted = (environment.variables as NonNullable<typeof environment.variables>).some(
		(variable) => variable.secret && refs[variable.name] !== undefined
	);
	if (!wanted) return text;
	return stringifyEnvironment(withSecretReferences(environment, refs), { format: "yml" });
}
