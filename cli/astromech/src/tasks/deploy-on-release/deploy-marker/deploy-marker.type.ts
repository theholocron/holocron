/** What `readMarker` found: the commit a package was last deployed at, or why there is none to use. */
export interface MarkerRead {
	/** The recorded commit; `undefined` when there is none, or it is not an ancestor of the release. */
	sha?: string;
	/** Set when a marker exists but cannot be used (not an ancestor of the release commit). */
	note?: string;
}
