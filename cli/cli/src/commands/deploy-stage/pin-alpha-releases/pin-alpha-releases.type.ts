/** The result of `pinAlphaReleases`. */
export interface PinnedAlphaReleases {
	dependencies: Record<string, string>;
	/** One line per version that changed. */
	changes: string[];
	/** One line per exact peer a pinned release declares that the staged set does not satisfy. */
	mismatches: string[];
}
