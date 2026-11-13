/** When a provider says a token was made and when it stops working. Each is an ISO date or time, left out when unknown. */
export interface TokenLifetime {
	/** When the token was made, or became valid when that is all the provider says (Cloudflare `not_before`). */
	createdAt?: string;
	/** When the token expires. Unset for a token that never does. */
	expiresAt?: string;
}
