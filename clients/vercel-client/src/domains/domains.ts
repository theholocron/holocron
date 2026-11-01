import type { RestClient } from "../utils.js";

/** A domain attached to a Vercel project. */
export interface VercelDomain {
	/** The domain name. */
	name: string;
	/** The domain's apex (registrable) name. */
	apexName: string;
	/** Whether Vercel has verified ownership of the domain. */
	verified: boolean;
}

/** The response of `domains.list()`. */
export interface VercelDomainsResponse {
	/** The domains attached to the project. */
	domains: VercelDomain[];
}

/**
 * One DNS verification challenge — complete any one of these (usually
 * just one is returned) to prove ownership. `type: "CNAME"` means
 * `domain` needs a CNAME record pointing at `value`; `type: "TXT"`
 * means a TXT record on `domain` with content `value`. The CNAME
 * target is generated per-project by Vercel, not a fixed well-known
 * host — always read it from this response, never hardcode it.
 */
export interface VercelDomainVerification {
	/** The record type to create: `CNAME` or `TXT`. */
	type: string;
	/** The name the record goes on. */
	domain: string;
	/** The record content. */
	value: string;
	/** Why Vercel asks for this record. */
	reason: string;
}

/** The response of `domains.add()`. */
export interface VercelAddDomainResult {
	/** The domain name. */
	name: string;
	/** The domain's apex (registrable) name. */
	apexName: string;
	/** Whether ownership is already verified; when `false`, `verification` lists what to do. */
	verified: boolean;
	/** The challenges to complete to verify ownership; absent when already verified. */
	verification?: VercelDomainVerification[];
}

/** One ranked CNAME/IPv4 recommendation — `rank: 1` is the preferred value. */
export interface VercelDomainConfigRecommendation<T> {
	/** The preference order; `1` is the preferred value. */
	rank: number;
	/** The recommended value. */
	value: T;
}

/**
 * DNS *routing* status for a domain — distinct from ownership (`verified`
 * on `VercelDomain`/`VercelAddDomainResult`). A domain can be verified
 * (Vercel trusts you own it) with no record actually pointing traffic at
 * Vercel yet, e.g. re-adding a domain whose apex is already verified on
 * this team short-circuits to `verified: true` with no `verification`
 * challenge (`domains.add` returns 409, not a fresh challenge) — this is
 * the only source for that domain's CNAME target in that case.
 */
export interface VercelDomainConfig {
	/** How Vercel currently sees the domain resolving. `null` = not resolving to Vercel at all. */
	configuredBy: "A" | "CNAME" | "http" | "dns-01" | null;
	/** `false` once DNS is correctly configured and a TLS cert can be issued. */
	misconfigured: boolean;
	/** Recommended CNAME target(s) for a subdomain, ranked; `[0]` is preferred. Per-project, never a fixed host. */
	recommendedCNAME: VercelDomainConfigRecommendation<string>[];
	/** Recommended A-record IPv4(s) for an apex domain, ranked. */
	recommendedIPv4: VercelDomainConfigRecommendation<string[]>[];
}

export function domains(rest: RestClient) {
	return {
		list: (projectId: string): Promise<VercelDomainsResponse> =>
			rest.request<VercelDomainsResponse>(`/v9/projects/${encodeURIComponent(projectId)}/domains`),

		add: (projectId: string, name: string): Promise<VercelAddDomainResult> =>
			rest.request<VercelAddDomainResult>(`/v10/projects/${encodeURIComponent(projectId)}/domains`, {
				method: "POST",
				body: { name },
			}),

		/**
		 * DNS routing status for `domain` — works regardless of whether the
		 * domain is already attached/verified on a project. `projectIdOrName`
		 * is optional per Vercel's docs ("use this when the domain is not yet
		 * associated with a project") but passed through when known to scope
		 * the recommendation to that project.
		 */
		config: (domain: string, projectIdOrName?: string): Promise<VercelDomainConfig> =>
			rest.request<VercelDomainConfig>(`/v6/domains/${encodeURIComponent(domain)}/config`, {
				query: projectIdOrName ? { projectIdOrName } : undefined,
			}),
	};
}
