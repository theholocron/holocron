/** How a secret whose value is only random is made. */
export interface GeneratedSecret {
	/** How many random bytes. */
	bytes: number;
	/** How the bytes are written: `hex` (two characters a byte) or `base64url`. */
	encoding: "hex" | "base64url";
	/** What reads it, for a row that explains the refusal of another name. */
	note: string;
}

/** Where the random bytes come from. Defaults to `node:crypto`'s `randomBytes`; tests inject a fixed one. */
export type RandomBytes = (size: number) => Uint8Array;
