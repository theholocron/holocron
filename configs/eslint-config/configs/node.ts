import type { Linter } from "eslint";
import n from "eslint-plugin-n";

export function node(): Linter.FlatConfig[] {
	return [
		n.configs["flat/recommended-module"],
		{
			name: "@theholocron/node",
			rules: {
				"n/no-process-exit": "off",
				"n/no-missing-import": "off", // TS handles this better
				"n/no-unsupported-features/es-syntax": "off",
				// `recommended-module`'s default auto-detects engines.node by
				// walking up from the linted file to the nearest package.json on a
				// real filesystem -- that lookup can't work when there IS no real
				// filesystem (Sentinel's Bucket 1 static-analysis check runs
				// Linter.verify() against fetched PR content in-memory, holocron#849)
				// and silently falls back to a conservative default, flagging
				// long-stable globals (Request/Response, holocron#858/#859) as
				// unsupported. Every org repo's engines.node floor is >=22
				// (holocron upgrade node keeps them in lockstep) -- pin it
				// explicitly so this rule never depends on filesystem detection
				// succeeding, everywhere this config runs.
				"n/no-unsupported-features/node-builtins": ["error", { version: ">=22.0.0" }],
			},
		},
	];
}
