/**
 * Turn a provider name into the package that implements it: `"github"` becomes `"<prefix>github"`. A scoped name
 * (`@acme/x`), a name that already starts with `communityPrefix` and any name containing `/` are returned as they are,
 * which is how plugins published outside your scope work.
 *
 * @param provider - The short name or the full package name.
 * @param prefix - What a short name is prefixed with, e.g. `@acme/mycli-plugin-`.
 * @param communityPrefix - The prefix an unscoped third-party package uses, e.g. `mycli-plugin-`.
 * @throws `Error` when `provider` is empty.
 */
export function resolvePluginPackage(provider: string, prefix: string, communityPrefix?: string): string {
	if (!provider) throw new Error("provider name is empty");
	if (provider.startsWith("@")) return provider;
	if (communityPrefix && provider.startsWith(communityPrefix)) return provider;
	if (provider.includes("/")) return provider;
	return prefix + provider;
}
