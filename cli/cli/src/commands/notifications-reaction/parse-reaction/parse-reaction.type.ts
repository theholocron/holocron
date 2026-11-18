/** A Unicode emoji, kept as written. */
export interface UnicodeReaction {
	kind: "unicode";
	value: string;
}

/** One of the server's own emoji, by name. */
export interface CustomReaction {
	kind: "custom";
	/** The emoji's name, without colons. */
	name: string;
	/** The file in the repo `setup` makes the emoji from when the server has none. */
	image?: string;
}

/** A layout reaction after reading. */
export type ParsedReaction = UnicodeReaction | CustomReaction;
