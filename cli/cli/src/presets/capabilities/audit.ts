import type { Capability } from "../../config/compose/index.js";

/** Options for the audit capability. */
export interface AuditOptions {
	/** Enable Knip unused-export analysis (default: false). */
	knip?: boolean;
	/** Enable Lighthouse performance audits (default: false). */
	performance?: boolean;
	/** Path to the Lighthouse config file. */
	lighthouseConfig?: string;
}

/**
 * Adds bundle-size measuring (`measure-bundle`) + optional Knip (`lint:unused`) and
 * Lighthouse (`test:perf`) auditing. Each task is marked `required` — `holocron setup`
 * derives the branch-protection checks from the manifest.
 * Requires: node
 */
export function audit({ knip = false, performance = false, lighthouseConfig }: AuditOptions = {}): Capability {
	return {
		id: "audit",
		requires: ["node"],
		tasks: [
			{ name: "measure-bundle", required: true },
			...(knip ? [{ name: "lint:unused", required: true }] : []),
			...(performance
				? [
						lighthouseConfig
							? { name: "test:perf", required: true, with: { "lighthouse-config": lighthouseConfig } }
							: { name: "test:perf", required: true },
					]
				: []),
		],
	};
}
