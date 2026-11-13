const LAYER = /^.+ - (local|dev|ci|prod)$/;

/** The layer words an Environment name can end in (`<org/repo> - ci`). */
export type Layer = "local" | "dev" | "ci" | "prod";

/**
 * The layer an Environment name ends in, or `fallback` for a name that is not a layer's.
 *
 * @param environment - The Environment's name.
 * @param fallback - The layer to use for a literal name.
 */
export function layerOf(environment: string, fallback: Layer): Layer {
	return (LAYER.exec(environment)?.[1] as Layer | undefined) ?? fallback;
}

/**
 * The short label of an Environment in a column heading: its layer word, else the whole name.
 *
 * @param environment - The Environment's name.
 */
export function labelOf(environment: string): string {
	return LAYER.exec(environment)?.[1] ?? environment;
}

/**
 * The group a vault provider's columns are listed under: `1Password` for the 1Password provider, else `Vault <name>`,
 * and plain `Vault` when there is no provider to name.
 *
 * @param providerName - The provider's name, when there is one.
 */
export function providerGroup(providerName: string | undefined): string {
	if (providerName === undefined) return "Vault";
	return providerName === "1password" ? "1Password" : `Vault ${providerName}`;
}
