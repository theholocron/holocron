import type { ConfigDirArea } from "@theholocron/datapad";
import { ConfigError } from "@theholocron/kyber/config";

import type { HolocronConfig, OrgConfig, ProviderOptions, RawProviderEntry } from "../../config/index.js";

/** The options each provider key of `.holocron/org.*` may hold. Checked against `OrgConfig` by the type. */
const ORG_OPTIONS: Record<keyof OrgConfig, readonly string[]> = {
	cloudflare: ["accountId"],
	vercel: ["teamId"],
	checkly: ["accountId"],
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

type Tuple = [provider: string, options: ProviderOptions];

const isTuple = (entry: unknown): entry is Tuple =>
	Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && isObject(entry[1]);

/** Check the shape of the area file: a closed list of providers, each with a closed list of string options. */
function validate(area: ConfigDirArea): Record<string, Record<string, string>> {
	if (!isObject(area.value)) throw new ConfigError(`${area.path} must export the org settings as an object`);
	for (const [provider, options] of Object.entries(area.value)) {
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
	return area.value as Record<string, Record<string, string>>;
}

/** Fill one entry when it names a provider the area holds; throws when the config already sets one of its options. */
function fill(
	entry: string | Tuple,
	org: Record<string, Record<string, string>>,
	capability: string,
	path: string
): string | Tuple {
	const [provider, options] = isTuple(entry) ? entry : [entry, {} as ProviderOptions];
	const values = org[provider];
	if (values === undefined || Object.keys(values).length === 0) return entry;
	for (const option of Object.keys(values)) {
		if (options[option] !== undefined) {
			throw new ConfigError(
				`${provider}.${option} is set in providers.${capability} and in ${path}. ` +
					`Set it in one place: remove the inline option or the key from ${path}`
			);
		}
	}
	return [provider, { ...options, ...values }];
}

/**
 * Fill the provider options of `.holocron/org.*` into the providers the config uses. A provider entry (a name, a
 * `[name, options]` tuple, or either inside a list) that names a provider the file holds gets each option it leaves
 * out. An option set inline and in the file is a `ConfigError` naming both (no merge, no precedence); a provider the
 * config does not use is ignored; a provider or option the file lists but `OrgConfig` does not know is an error.
 */
export function placeOrg(raw: HolocronConfig, area: ConfigDirArea): HolocronConfig {
	const org = validate(area);
	if (raw.providers === undefined) return raw;
	const providers: Record<string, RawProviderEntry> = { ...raw.providers };
	for (const [capability, entry] of Object.entries(raw.providers) as [string, RawProviderEntry][]) {
		providers[capability] =
			Array.isArray(entry) && !isTuple(entry)
				? entry.map((item) => fill(item, org, capability, area.path))
				: fill(entry as string | Tuple, org, capability, area.path);
	}
	return { ...raw, providers };
}
