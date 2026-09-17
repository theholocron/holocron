import type { RestClient } from "../utils.js";

export interface VercelDomain {
	name: string;
	apexName: string;
	verified: boolean;
}

export interface VercelDomainsResponse {
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
	type: string;
	domain: string;
	value: string;
	reason: string;
}

export interface VercelAddDomainResult {
	name: string;
	apexName: string;
	verified: boolean;
	verification?: VercelDomainVerification[];
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
	};
}
