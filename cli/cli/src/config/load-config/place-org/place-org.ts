import type { ConfigDirArea } from "@theholocron/datapad";
import { ConfigError } from "@theholocron/kyber/config";

import type { HolocronConfig, OrgConfig, ProviderOptions, RawProviderEntry } from "../../config/index.js";

/** The options each provider key of `.holocron/org.*` may hold. Checked against `OrgConfig` by the type. */
const ORG_OPTIONS: Record<Exclude<keyof OrgConfig, "domain">, readonly string[]> = {
	cloudflare: ["accountId"],
	vercel: ["teamId"],
	checkly: ["accountId"],
	sentry: ["org"],
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

type Tuple = [provider: string, options: ProviderOptions];

const isTuple = (entry: unknown): entry is Tuple =>
	Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && isObject(entry[1]);

/** The checked content of one org file: the top-level `domain` and the provider options. */
type Checked = { domain?: string; providers: Record<string, Record<string, string>> };

/**
 * Check the shape of the area file: the top-level `domain` (a non-empty string), then a closed list of providers,
 * each with a closed list of string options.
 */
function validate(area: ConfigDirArea): Checked {
	if (!isObject(area.value)) throw new ConfigError(`${area.path} must export the org settings as an object`);
	const { domain, ...rest } = area.value;
	if (domain !== undefined && (typeof domain !== "string" || domain === "")) {
		throw new ConfigError(`${area.path}: "domain" must be a non-empty string`);
	}
	for (const [provider, options] of Object.entries(rest)) {
		const allowed = (ORG_OPTIONS as Record<string, readonly string[] | undefined>)[provider];
		if (allowed === undefined) {
			throw new ConfigError(
				`${area.path} has an unknown provider "${provider}". Known: ${Object.keys(ORG_OPTIONS).join(", ")}`
			);
		}
		if (!isObject(options)) throw new ConfigError(`${area.path}: "${provider}" must be an object of options`);
		for (const [option, value] of Object.entries(options)) {
			if (!allowed.includes(option)) {
				throw new ConfigError(
					`${area.path}: "${provider}.${option}" is not an org option. Known: ${allowed.join(", ")}`
				);
			}
			if (typeof value !== "string" || value === "") {
				throw new ConfigError(`${area.path}: "${provider}.${option}" must be a non-empty string`);
			}
		}
	}
	return { ...(domain !== undefined ? { domain } : {}), providers: rest as Record<string, Record<string, string>> };
}

/** An org option's value and the file it came from, for the error that names it. */
type Sourced = { value: string; path: string };

/**
 * The org options of an area and, when the repository root has the same area, the root's under them: an option set in
 * both takes the config's own value, option by option (the root's other options stay). Each file is checked on its own.
 */
function merge(area: ConfigDirArea): { domain?: Sourced; providers: Record<string, Record<string, Sourced>> } {
	const providers: Record<string, Record<string, Sourced>> = {};
	let domain: Sourced | undefined;
	for (const layer of area.root ? [area.root, area] : [area]) {
		const checked = validate(layer);
		if (checked.domain !== undefined) domain = { value: checked.domain, path: layer.path };
		for (const [provider, options] of Object.entries(checked.providers)) {
			const sourced = (providers[provider] ??= {});
			for (const [option, value] of Object.entries(options)) sourced[option] = { value, path: layer.path };
		}
	}
	return { ...(domain ? { domain } : {}), providers };
}

/** Fill one entry when it names a provider the area holds; throws when the config already sets one of its options. */
function fill(entry: string | Tuple, org: Record<string, Record<string, Sourced>>, capability: string): string | Tuple {
	const [provider, options] = isTuple(entry) ? entry : [entry, {} as ProviderOptions];
	const values = org[provider];
	if (values === undefined || Object.keys(values).length === 0) return entry;
	const filled: Record<string, string> = {};
	for (const [option, { value, path }] of Object.entries(values)) {
		if (options[option] !== undefined) {
			throw new ConfigError(
				`${provider}.${option} is set in providers.${capability} and in ${path}. ` +
					`Set it in one place: remove the inline option or the key from ${path}`
			);
		}
		filled[option] = value;
	}
	return [provider, { ...options, ...filled }];
}

/**
 * Fill `.holocron/org.*` into the config. Its top-level `domain` (the org's zone) is set on a config that leaves
 * `domain` out; set inline and in the file it is a `ConfigError` naming both. Its provider options go into the
 * providers the config uses. A provider entry (a name, a
 * `[name, options]` tuple, or either inside a list) that names a provider the file holds gets each option it leaves
 * out. An option set inline and in the file is a `ConfigError` naming both (no merge, no precedence); a provider the
 * config does not use is ignored; a provider or option the file lists but `OrgConfig` does not know is an error.
 * When the area also came from the repository root (`area.root`, a config in a subdirectory), the two files combine
 * option by option and the config's own file wins; that is not an error.
 */
export function placeOrg(raw: HolocronConfig, area: ConfigDirArea): HolocronConfig {
	const { domain, providers: org } = merge(area);
	if (domain !== undefined && raw.domain !== undefined) {
		throw new ConfigError(
			`domain is set in the config and in ${domain.path}. Set it in one place: remove the inline value or the key from ${domain.path}`
		);
	}
	const withDomain = domain === undefined ? raw : { ...raw, domain: domain.value };
	if (withDomain.providers === undefined) return withDomain;
	const providers: Record<string, RawProviderEntry> = { ...withDomain.providers };
	for (const [capability, entry] of Object.entries(withDomain.providers) as [string, RawProviderEntry][]) {
		providers[capability] =
			Array.isArray(entry) && !isTuple(entry)
				? entry.map((item) => fill(item, org, capability))
				: fill(entry as string | Tuple, org, capability);
	}
	return { ...withDomain, providers };
}
