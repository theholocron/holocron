import type { DescribeLoggingOptions } from "./dev-logging.type.js";

/**
 * One line saying where this run's structured logs go: they ship to Axiom when both variables are set. Names the
 * dataset (not a secret) and never the token, so a development run does not quietly write into production's dataset.
 */
export function describeLogging(env: Record<string, string | undefined>, options: DescribeLoggingOptions): string {
	const token = env[options.tokenVar];
	const dataset = env[options.datasetVar];
	return token && dataset
		? `logs: shipped to Axiom, dataset "${dataset}"`
		: `logs: not shipped to Axiom (${options.tokenVar} and ${options.datasetVar} are not both set)`;
}
