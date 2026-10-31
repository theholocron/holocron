export interface TokenExpiry {
	/** `expires in 12 days`. */
	text: string;
	/** Whether the token is inside the warning window (or already past it). */
	soon: boolean;
}
