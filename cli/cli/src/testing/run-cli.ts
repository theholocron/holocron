import { createCliRunner } from "@theholocron/kyber/testing";

import { CLI_BIN } from "./build-cli.js";

export type { CliRun, RunCliOptions } from "@theholocron/kyber/testing";

/**
 * Runs the built CLI (`dist/cli.mjs`) in a fresh temporary directory with a controlled environment (no tokens, no
 * telemetry, no update check), writing a run's `config` as `holocron.config.json`.
 */
export const runCli = createCliRunner({
	bin: CLI_BIN,
	configFile: "holocron.config.json",
	env: { HOLOCRON_TELEMETRY: "false" },
	prefix: "holocron-cli-",
});
