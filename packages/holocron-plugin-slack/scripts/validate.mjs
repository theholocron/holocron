#!/usr/bin/env node
/**
 * Read-only smoke test for @theholocron/holocron-plugin-slack.
 *
 * READ-ONLY. Tests verifyToken — proves the bot token is valid and
 * returns the workspace and user it belongs to.
 *
 * Usage:
 *   pnpm --filter @theholocron/holocron-plugin-slack validate
 */

import chalk from "chalk";

import { AuthError, resolveToken, verifyToken } from "../src/index.ts";

const ok = (msg) => console.log(`${chalk.green("✓")} ${msg}`);
const fail = (msg) => console.log(`${chalk.red("✗")} ${msg}`);
const step = (msg) => console.log(chalk.cyan(`[${msg}]`));
const hint = (msg) => console.log(chalk.dim(`         hint: ${msg}`));

console.log(chalk.bold("Validating @theholocron/holocron-plugin-slack") + chalk.dim(" (READ-ONLY)"));
console.log("");

let token;
try {
	token = resolveToken();
} catch (err) {
	if (err instanceof AuthError) {
		console.error(chalk.red(err.message));
		console.error(chalk.dim("  see: packages/holocron-plugin-slack/README.md#auth"));
		process.exit(2);
	}
	throw err;
}

step("1/1 verifyToken");
const verifyResult = await verifyToken(token);
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
	if (/invalid_auth|not_authed/i.test(message))
		return "token invalid — check it starts with xoxb- and regenerate at https://api.slack.com/apps";
	if (/token_revoked/i.test(message)) return "token has been revoked — reinstall the app to get a new token";
	if (/fetch failed|network/i.test(message)) return "network error — check slack.com reachable";
	return null;
}
