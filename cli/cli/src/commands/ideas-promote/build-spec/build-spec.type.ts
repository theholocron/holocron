/** What {@link buildSpec} writes a draft spec from. */
export interface BuildSpecInput {
	/** The issue's title; it becomes the spec's heading. */
	title: string;
	/** The issue's body as the tracker returned it; `undefined` when the provider gave none. */
	body: string | undefined;
	/** The issue in the form specs use: `owner/repo#1234`, or a Linear key such as `RANDO-7`. */
	issue: string;
}

/** The spec text and what was found in the issue body. */
export interface BuiltSpec {
	/** The whole file, ending in one newline. */
	content: string;
	/** Whether the body carried the `Filed from idea:` line or the hidden marker `sync ideas` writes. */
	fromIdea: boolean;
}
