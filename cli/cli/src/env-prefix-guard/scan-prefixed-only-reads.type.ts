/** One environment read of a `HOLOCRON_<NAME>` spelling whose bare `<NAME>` fallback the file never reads. */
export interface PrefixedOnlyRead {
	/** The bare group 1 name, e.g. `AXIOM_DATASET`. */
	name: string;
	/** 1-based line of the read. */
	line: number;
}
