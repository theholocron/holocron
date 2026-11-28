/** Which variables {@link describeLogging} reads. */
export interface DescribeLoggingOptions {
	/** The variable holding the Axiom ingest token, e.g. `SENTINEL_AXIOM_INGEST_TOKEN`. */
	tokenVar: string;
	/** The variable holding the Axiom dataset, e.g. `AXIOM_DATASET`. */
	datasetVar: string;
}
