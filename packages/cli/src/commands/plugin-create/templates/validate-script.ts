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
 *
 * Includes a `hintFor(message)` helper the operator customizes with
 * vendor-specific "here's the likely fix" guidance for common error
 * shapes (401 / 403 / 404 / network / 5xx). Points users at docs and
 * setup steps rather than leaving them staring at a raw stack trace.
 */
export function render(inputs: TemplateInputs): string {
	return `#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-${inputs.slug} against
 * a live ${inputs.vendorName} account.
 *
 * READ-ONLY BY DESIGN. Never calls write(), or bootstrap methods
 * (\`ensureProject\`, \`ensureEnvironment\`, etc.). Any ERROR line means
 * the plugin needs adjusting — the \`hintFor\` helper below points at
 * the most likely fix per error shape.
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
 * surface. Model on \`packages/holocron-plugin-infisical/scripts/validate.mjs\`.
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
	console.error("  see: packages/holocron-plugin-${inputs.slug}/README.md#setup");
	process.exit(2);
}

console.log("Validating @theholocron/holocron-plugin-${inputs.slug} (READ-ONLY)");
console.log("");

// ── 1. verifyToken ─────────────────────────────────────────────────
console.log("[1/N] verifyToken");
const verifyResult = await verifyToken(token);
console.log(\`      \${verifyResult.ok ? "✓" : "✗"} \${JSON.stringify(verifyResult)}\`);
if (!verifyResult.ok) {
	const hint = hintFor(verifyResult.message);
	if (hint) console.log(\`         hint: \${hint}\`);
}
console.log("");

// ── 2..N. capability method calls ──────────────────────────────────
// TODO: implement one \`runStep\`-wrapped call per meaningful read-side
// capability method. Model on the infisical validate.mjs. Never call
// write / ensure* / other mutating paths.
//
// Example:
//   console.log("[2/N] vault.list()");
//   await runStep(async () => {
//       const keys = await vault.list();
//       console.log(\`      ✓ \${keys.length} secrets\`);
//   });

console.log("Done. Fill in capability method calls above before shipping.");

// ── helpers ────────────────────────────────────────────────────────

/** Wrap a capability call, print ERROR + hint on failure. */
async function runStep(body) {
	try {
		await body();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.log(\`      ✗ ERROR: \${message}\`);
		const hint = hintFor(message);
		if (hint) console.log(\`         hint: \${hint}\`);
	}
}

/**
 * Point the operator at the most likely fix based on the error shape.
 * Generic defaults below — CUSTOMIZE per your vendor's docs URLs and
 * common permission/config gotchas.
 */
function hintFor(message) {
	if (/→ 401/.test(message)) {
		return "token invalid — regenerate per ${inputs.vendorName}'s docs (see README §Setup)";
	}
	if (/→ 403/.test(message)) {
		return "token authenticates but lacks scope — check the token/identity has permissions on the resource";
	}
	if (/→ 404/.test(message)) {
		return "endpoint or resource not found — verify your positional args match a real resource";
	}
	if (/fetch failed|status: 0|network/i.test(message)) {
		return "network error — check the base URL (${inputs.baseUrl}) and connectivity";
	}
	if (/→ 5\\d\\d/.test(message)) {
		return "server error — vendor-side. Retry, and check the vendor's status page if persistent";
	}
	return null;
}
`;
}
