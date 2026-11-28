/** One environment read that names a bare variable without the `HOLOCRON_` prefix. */
export interface UnprefixedEnvRead {
	/** The bare variable name, e.g. `AXIOM_DATASET`. */
	name: string;
	/** 1-based line of the read. */
	line: number;
}
