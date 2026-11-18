/** A Unicode emoji, kept as written. */
export interface UnicodeReaction {
	/** Tells it from a server emoji. */
	kind: "unicode";
	/** The emoji character, as written. */
	value: string;
}

/** One of the server's own emoji, by name. */
export interface CustomReaction {
	/** Tells it from a Unicode emoji. */
	kind: "custom";
	/** The emoji's name, without colons. */
	name: string;
	/** The file in the repo `setup` makes the emoji from when the server has none. */
	image?: string;
}

/** A layout reaction after reading. */
export type ParsedReaction = UnicodeReaction | CustomReaction;
