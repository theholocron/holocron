/**
 * The org's DNS zone as the presets ship it to a consumer repo that has no `.holocron/org.ts` of its own. A repo
 * with an org area sets `domain` there instead and does not take it from a preset (both set is a `ConfigError`,
 * #1878): destructure `{ repo, providers, org, docs }` from the preset, as the root `holocron.config.ts` does.
 */
export const DEFAULT_DOMAIN = "theholocron.dev";

/** The subdomain the engineering wiki is served from, under the org's zone. */
export const WIKI_SUBDOMAIN = "wiki";

/**
 * The wiki's hostname under a zone.
 *
 * @param domain - The org's zone; defaults to {@link DEFAULT_DOMAIN} when no config is in reach.
 * @returns For example `wiki.theholocron.dev`.
 */
export function wikiHost(domain: string = DEFAULT_DOMAIN): string {
	return `${WIKI_SUBDOMAIN}.${domain}`;
}
