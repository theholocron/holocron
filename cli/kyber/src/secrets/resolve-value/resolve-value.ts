import { getCredential } from "../credential-store/index.js";
import { firstEnv } from "../first-env/index.js";
import type { ResolveValueOptions } from "./resolve-value.type.js";

/** `names` with each one preceded by its `<prefix>_` spelling; unchanged when there is no prefix. */
function withPrefix(names: readonly string[], prefix: string | undefined): string[] {
	if (!prefix) return [...names];
	return names.flatMap((name) => (name.startsWith(`${prefix}_`) ? [name] : [`${prefix}_${name}`, name]));
}

/**
 * Finds a plain, non-secret value (an account id, a dataset, a project slug) through the same chain the token
 * resolvers use, without the flag and the keyring: the variables of `env` (the process environment when none is
 * given), then the variables the `credentials` providers returned (see {@link setCredentials}). A name is tried in the
 * order given in each source. An empty string counts as unset. `undefined` when no source has one.
 *
 * @param names - The variable names to try, the tool's own before the vendor's.
 * @param env - The environment to read. Default `process.env`; a test passes its own.
 * @param options - `prefix` makes each name a `<prefix>_<name>` then bare `<name>` pair (see {@link ResolveValueOptions}).
 *
 * @example
 * ```ts
 * // HOLOCRON_CLOUDFLARE_ACCOUNT_ID, then CLOUDFLARE_ACCOUNT_ID
 * const accountId = options.accountId ?? resolveValue(["CLOUDFLARE_ACCOUNT_ID"], options.env, { prefix: "HOLOCRON" });
 * ```
 */
export function resolveValue(
	names: readonly string[],
	env?: Record<string, string | undefined>,
	options: ResolveValueOptions = {}
): string | undefined {
	const tried = withPrefix(names, options.prefix);
	return firstEnv(env, ...tried) ?? getCredential(...tried);
}
