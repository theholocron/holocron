import type { CheckRow } from "@theholocron/kyber/ui";

import type { DoctorEnvironment } from "./doctor-secrets.type.js";

/**
 * Why `doctor secrets` has nothing to compare for an environment, in one place. `local` and `dev` are read by
 * `doctor credentials` until a later step folds them in (the wording here changes then); `test` has no layer.
 */
const NOT_CHECKED: Partial<Record<DoctorEnvironment, string>> = {
	local: "not checked here yet, run doctor credentials",
	dev: "not checked here yet, run doctor credentials",
	test: "has no layer (tests use fakes and read none)",
};

/**
 * The skipped row for an environment `doctor secrets` does not compare, naming the environment and the reason.
 *
 * @param env - The environment asked for with `--env`.
 * @returns The row, or `undefined` for `ci` and `prod`, which have rows of their own.
 */
export function environmentSkipRow(env: DoctorEnvironment): CheckRow | undefined {
	const reason = NOT_CHECKED[env];
	if (reason === undefined) return undefined;
	return { id: `env-${env}`, title: `${env} environment`, status: "skip", detail: `${env}: ${reason}`, problems: [] };
}
