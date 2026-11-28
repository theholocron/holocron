/**
 * `credentials` capability for 1Password: the variables of one 1Password Environment, read for the token resolvers.
 *
 * `op` signs in on its own (the desktop app and Touch ID on a laptop, `OP_SERVICE_ACCOUNT_TOKEN` in CI), so this needs
 * no token of its own, which is what lets it be asked for the others.
 */

import type { Credentials, CredentialsInspection } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";

import { parseDotenv } from "../parse-dotenv.js";
import { parseEnvironmentJson } from "../parse-environment-json.js";
import type { OpShell } from "../shell.js";

/** How long to wait for `op` (a Touch ID prompt included) before giving up on the environment. */
export const READ_TIMEOUT_MS = 60_000;

/** `op` words a missing Environment as "environment couldn't be found". */
const NOT_FOUND = /couldn.?t be found|could not be found|not found/i;

/**
 * The spellings of an Environment name to try, in order: as written, lowercase, Title case, UPPERCASE. `op` finds an
 * Environment by its exact name and has no command that lists them, so the real spelling cannot be looked up.
 */
export function spellings(name: string): string[] {
	const title = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
	return [...new Set([name, name.toLowerCase(), title, name.toUpperCase()])];
}

/** `credentials` capability for 1Password, implemented by shelling out to `op environment secret list`. */
export class OpCredentials implements Credentials {
	/** Capability key; always `"credentials"`. */
	readonly key = "credentials" as const;
	/** Provider name; always `"1password"`. */
	readonly providerName = "1password";

	constructor(private readonly shell: OpShell) {}

	/**
	 * Every variable of the Environment, with values. Tries {@link spellings} of the name until `op` finds one;
	 * any other failure (not signed in, a prompt that timed out) is thrown at once.
	 */
	async read(environment: string): Promise<Record<string, string>> {
		return parseDotenv((await this.list(environment, ["--reveal"])).stdout);
	}

	/**
	 * The Environment as `op` spells it, the names of its variables and which of them are visible, asked without
	 * `--reveal` so no value is printed or kept: `op` shows a placeholder for each value, which is not read, and the
	 * `concealed` flag that says secret from variable. Tries the same spellings as `read`.
	 */
	async inspect(environment: string): Promise<CredentialsInspection> {
		const { name, stdout } = await this.list(environment, [], "json");
		const entries = parseEnvironmentJson(stdout);
		return {
			environment: name,
			names: entries.map((e) => e.name),
			visible: entries.filter((e) => !e.concealed).map((e) => e.name),
		};
	}

	private async list(
		environment: string,
		flags: string[],
		format: "dotenv" | "json" = "dotenv"
	): Promise<{ name: string; stdout: string }> {
		const tried = spellings(environment);
		for (const name of tried) {
			const result = this.shell.run(["environment", "secret", "list", name, ...flags, `--format=${format}`], {
				timeoutMs: READ_TIMEOUT_MS,
			});
			if (result.ok) return { name, stdout: result.stdout };
			if (!NOT_FOUND.test(result.stderr)) {
				throw new ProviderApiError(
					`1Password environment secret list ${name} failed: ${result.stderr || "no stderr"}`,
					0,
					result.stderr
				);
			}
		}
		throw new ProviderApiError(
			`1Password has no Environment named "${environment}" (tried ${tried.map((n) => `"${n}"`).join(", ")}). ` +
				"Check the name, or use the Environment's id; names are matched exactly and `op` cannot list them.",
			404,
			undefined
		);
	}
}
