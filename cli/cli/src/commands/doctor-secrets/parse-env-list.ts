import { ConfigError } from "@theholocron/kyber/config";

import type { DoctorEnvironment } from "./doctor-secrets.type.js";

/** The environments `--env` accepts, in the order they are checked and listed. */
export const DOCTOR_ENVIRONMENTS: readonly DoctorEnvironment[] = ["local", "dev", "ci", "test", "prod"];

/**
 * Turns the `--env` values into the environments to check. Each value may itself be a comma-separated list, so
 * `--env local,dev` and `--env local --env dev` mean the same. Duplicates are collapsed, spaces around a name are
 * ignored, and the result is in {@link DOCTOR_ENVIRONMENTS} order whatever order was typed.
 *
 * @param values - The raw `--env` values, or `undefined` when the flag was not given.
 * @returns The environments named, or `undefined` for none given (run every environment the config declares).
 * @throws {ConfigError} For a name that is not one of {@link DOCTOR_ENVIRONMENTS}, or an empty name; the message lists the allowed ones.
 */
export function parseEnvList(values: readonly string[] | undefined): DoctorEnvironment[] | undefined {
	if (!values || values.length === 0) return undefined;
	const names = values.flatMap((value) => value.split(",").map((name) => name.trim()));
	const allowed = DOCTOR_ENVIRONMENTS.join(", ");
	const unknown = [...new Set(names.filter((name) => !(DOCTOR_ENVIRONMENTS as readonly string[]).includes(name)))];
	if (unknown.length > 0) {
		const shown = unknown.map((name) => (name === "" ? "(empty)" : JSON.stringify(name))).join(", ");
		throw new ConfigError(`--env does not know ${shown}: use ${allowed}, comma-separated or repeated`);
	}
	return DOCTOR_ENVIRONMENTS.filter((env) => names.includes(env));
}
