/** A layout reaction after reading: a Unicode emoji as it is written, or a server emoji by name. */
export type ParsedReaction =
	| { kind: "unicode"; value: string }
	| {
			kind: "custom";
			/** The emoji's name, without colons. */
			name: string;
			/** The file in the repo `setup` makes the emoji from when the server has none. */
			image?: string;
	  };
