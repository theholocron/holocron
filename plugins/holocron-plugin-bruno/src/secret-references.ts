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

/** Where each secret variable's value comes from, and which layer each Bruno environment is. */
export interface SecretWiring {
	/** Secret variable name to the vault entry that holds its value, e.g. `webhookSecret` to `SENTINEL_WEBHOOK_SECRET`. */
	refs: Record<string, string>;
	/** Bruno environment name to the vault layer its secrets come from, e.g. `Sentinel (prod)` to `prod`. */
	layers: Record<string, string>;
}

/**
 * The name a layer's copy of an entry has in the `.env` file: the layer word in capitals, then the entry
 * (`dev` and `SENTINEL_WEBHOOK_SECRET` give `DEV_SENTINEL_WEBHOOK_SECRET`). The one place the scheme lives: the
 * workspace's references and the values `open requests` writes both come from it, so each Bruno environment reads its
 * own layer's value and a layer that was not loaded leaves its variable unresolved.
 */
export const layeredName = (layer: string, entry: string): string => `${layer.toUpperCase()}_${entry}`;

/** The part of a Bruno environment variable this reads and writes. */
interface EnvironmentVariable {
	name: string;
	value?: string | undefined;
	secret?: boolean | undefined;
}

/** What {@link withSecretReferences} reads of an environment. */
interface WiredEnvironment {
	name?: string | undefined;
	variables?: unknown[] | undefined;
}

/** The reference a variable of `environment` should hold, or `undefined` when the wiring does not cover it. */
function wantedReference(
	environmentName: string | undefined,
	variableName: string,
	wiring: SecretWiring
): string | undefined {
	const layer = environmentName === undefined ? undefined : wiring.layers[environmentName];
	const entry = wiring.refs[variableName];
	return layer === undefined || entry === undefined ? undefined : referenceTo(layeredName(layer, entry));
}

/**
 * The environment with each variable the wiring covers made a plain variable whose value is the reference to its
 * layer's copy of the entry: a secret variable named in `refs`, in an environment named in `layers`, and a variable that
 * already holds a different reference. Everything else is left as it was, so a secret of an environment with no layer
 * stays blank.
 */
export function withSecretReferences<T extends WiredEnvironment>(environment: T, wiring: SecretWiring | undefined): T {
	if (!wiring || !environment.variables) return environment;
	return {
		...environment,
		variables: (environment.variables as EnvironmentVariable[]).map((variable) => {
			const reference = wantedReference(environment.name, variable.name, wiring);
			const refers = variable.secret || referencedName(variable.value) !== undefined;
			return reference === undefined || !refers ? variable : { ...variable, secret: false, value: reference };
		}),
	};
}

/**
 * The text of a workspace environment file with its variables wired as {@link withSecretReferences} does for a generated
 * one: for a file that is already written, whose secrets `sync requests` would otherwise find in step and leave blank,
 * or whose reference names another layer's copy. A file with nothing to change comes back as it is, byte for byte, so
 * Bruno's own layout is never rewritten for nothing.
 */
export function healReferences(text: string, wiring: SecretWiring | undefined): string {
	if (!wiring) return text;
	const environment = parseEnvironment(text, { format: "yml" });
	// Bruno's reader always gives a list, empty for a file with none.
	const wanted = (environment.variables as NonNullable<typeof environment.variables>).some((variable) => {
		const reference = wantedReference(environment.name, variable.name, wiring);
		return (
			reference !== undefined &&
			(variable.secret || referencedName(variable.value) !== undefined) &&
			variable.value !== reference
		);
	});
	if (!wanted) return text;
	return stringifyEnvironment(withSecretReferences(environment, wiring), { format: "yml" });
}
