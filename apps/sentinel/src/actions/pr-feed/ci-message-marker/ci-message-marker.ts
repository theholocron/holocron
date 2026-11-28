/** The last line of a CI message, which the handler looks for in a thread before it posts, so a redelivery adds nothing. */
export function ciMessageMarker(sha: string, conclusion: string): string {
	return `-# ci: ${sha} ${conclusion}`;
}
