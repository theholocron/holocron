import type { Capability } from "../../config/compose/index.js";

export interface AuditOptions {
	/** Enable Knip unused-export analysis (default: false). */
	knip?: boolean;
	/** Enable Lighthouse performance audits (default: false). */
	performance?: boolean;
	/** Path to the Lighthouse config file. */
	lighthouseConfig?: string;
}

/**
 * Adds BundleWatch + optional Knip and Lighthouse auditing. Marked `required` —
 * `holocron setup` derives the `audit / Conclusion` branch-protection check
 * from the manifest.
 * Requires: node
 */
export function audit({ knip = false, performance = false, lighthouseConfig }: AuditOptions = {}): Capability {
	const withBlock: Record<string, unknown> = {};
	if (knip) withBlock["run-knip"] = true;
	if (performance) withBlock["run-performance"] = true;
	if (lighthouseConfig) withBlock["lighthouse-config"] = lighthouseConfig;

	return {
		id: "audit",
		requires: ["node"],
		tasks: [
			Object.keys(withBlock).length > 0
				? { name: "audit", required: true, with: withBlock }
				: { name: "audit", required: true },
		],
	};
}
