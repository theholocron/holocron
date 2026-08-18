#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-discord.
 *
 * READ-ONLY. Tests verifyToken — proves the webhook URL is valid and
 * returns the webhook name and id.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-discord validate
 */

import chalk from "chalk";

import { AuthError, resolveToken, verifyToken } from "../src/index.ts";

const ok = (msg) => console.log(`${chalk.green("✓")} ${msg}`);
const fail = (msg) => console.log(`${chalk.red("✗")} ${msg}`);
const step = (msg) => console.log(chalk.cyan(`[${msg}]`));
const hint = (msg) => console.log(chalk.dim(`         hint: ${msg}`));

console.log(chalk.bold("Validating @theholocron/holocron-plugin-discord") + chalk.dim(" (READ-ONLY)"));
console.log("");

let webhookUrl;
try {
	webhookUrl = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(chalk.red(err.message));
		console.error(chalk.dim("  see: packages/holocron-plugin-discord/README.md#auth"));
		process.exit(2);
	}
	throw err;
}

step("1/1 verifyToken");
const verifyResult = await verifyToken(webhookUrl);
if (verifyResult.ok) {
	ok(verifyResult.subject);
} else {
	fail(verifyResult.message);
	const h = hintFor(verifyResult.message);
	if (h) hint(h);
}

console.log("");
console.log(chalk.dim("Done. No writes."));

function hintFor(message) {
	if (/404|not found|invalid/i.test(message))
		return "webhook not found or deleted — regenerate it in Discord → channel settings → Integrations → Webhooks";
	if (/Invalid Discord webhook URL/i.test(message))
		return "the stored value is not a webhook URL — re-run: holocron auth set discord <https://discord.com/api/webhooks/...>";
	if (/fetch failed|network/i.test(message)) return "network error — check discord.com reachable";
	return null;
}
