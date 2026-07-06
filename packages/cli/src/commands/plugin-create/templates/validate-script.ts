import type { TemplateInputs } from "../template-inputs.js";

/**
 * Scaffolds `scripts/validate.mjs` — a smoke-test the operator runs
 * against a live vendor account to verify the plugin's REST endpoints,
 * auth, and response parsing all work in reality (the unit tests only
 * exercise stubbed HTTP responses). READ-ONLY BY DESIGN.
 *
 * Convention: every plugin ships this script + a matching `validate`
 * entry in `package.json`'s scripts block, so operators run
 * `pnpm --filter @theholocron/holocron-plugin-<slug> validate`.
 * Capability-specific args (project id, workspace, etc.) come from
 * positional command-line arguments; the plugin author fills in the
 * exact shape per their vendor.
 */
export function render(inputs: TemplateInputs): string {
	return `#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-${inputs.slug} against
 * a live ${inputs.vendorName} account.
 *
 * READ-ONLY BY DESIGN. Never calls write(), or bootstrap methods
 * (\`ensureProject\`, \`ensureEnvironment\`, etc.). Any ERROR line means
 * the plugin needs adjusting.
 *
 * Auth: reads the ${inputs.vendorName} token from holocron's keyring —
 * you must have run \`pnpm holocron auth set ${inputs.slug} <TOKEN>\` first.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-${inputs.slug} validate <arg1> [arg2] ...
 *
 * TODO: replace the positional args below with whatever your
 * capability's methods need (e.g., project id, environment slug,
 * secret name). Adapt the test steps to your capability's method
 * surface. Model on \`packages/holocron-plugin-infisical/scripts/validate.mjs\`
 * or \`packages/holocron-plugin-doppler/scripts/validate.mjs\` (if it
 * exists).
 */

import { getToken } from "@theholocron/cli";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- filled in by operator
import { createPlugin, verifyToken } from "../src/index.ts";

const args = process.argv.slice(2);

if (args.length === 0) {
	console.error("usage: pnpm --filter @theholocron/holocron-plugin-${inputs.slug} validate <args>");
	process.exit(2);
}

const token = getToken("${inputs.slug}");
if (!token) {
	console.error("no ${inputs.vendorName} token in keyring. Run: pnpm holocron auth set ${inputs.slug} <TOKEN>");
	process.exit(2);
}

console.log("Validating @theholocron/holocron-plugin-${inputs.slug} (READ-ONLY)");
console.log("");

// ── 1. verifyToken ─────────────────────────────────────────────────
console.log("[1/N] verifyToken");
const verifyResult = await verifyToken(token);
console.log(\`      \${verifyResult.ok ? "✓" : "✗"} \${JSON.stringify(verifyResult)}\`);
console.log("");

// ── 2..N. capability method calls ──────────────────────────────────
// TODO: implement one console.log-wrapped call per meaningful
// read-side capability method. Model on the infisical / doppler
// validate.mjs. Never call write / ensure* / other mutating paths.

console.log("Done. Fill in capability method calls above before shipping.");
`;
}
