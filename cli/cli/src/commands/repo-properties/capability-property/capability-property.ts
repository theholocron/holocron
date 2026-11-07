import { CARDINALITY } from "../../../plugin/index.js";

/** The organization's custom property that lists the capabilities a repo wires. */
export const CAPABILITIES_PROPERTY = "holocron_capabilities";

/**
 * Every value that property must allow: each capability the CLI defines, so a new capability is a value the
 * organization has to allow before any repo can declare it.
 */
export function capabilityValues(): string[] {
	return Object.keys(CARDINALITY).sort();
}
