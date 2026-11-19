import type { NoDeepCheck } from "./no-deep-check.type.js";

/**
 * The capabilities that deliberately have no entry in `DEEP_CHECKS`, with why. `deep-checks.test.ts` fails for a
 * capability that is in neither this list nor `DEEP_CHECKS`, in both, or named here that no longer exists or now has a
 * check. A new capability therefore needs a deep check or a reason here (#1565). The plain `holocron doctor` smoke check
 * still loads every one of them.
 */
export const NO_DEEP_CHECK: NoDeepCheck = {
	ci: "`doctor ci` and `doctor repo` check the CI setup from the config and the workflow files; nothing is read from the provider",
	issues: "a provider's own setup is checked by `holocron provider <name> doctor`; the smoke check validates the status mapping",
	deployment: "`doctor workers` reads the deployment projects, their domains and the newest deployment",
	storage: "no declared state to compare yet; only the smoke check loads it",
	auth: "no declared state to compare yet; the smoke check calls `whoami()`",
	tooling: "`holocron sync requests --check` compares the request files with the tool's workspace",
	analytics: "no declared state to compare (spec tech-doctor-deep-checks, out of scope)",
	tunnels: "a tunnel is made on demand by `new tunnel` and `dev`; nothing is declared to compare",
	ideas: "files only; `holocron sync ideas --dry-run` reports each note's state",
	coverage: "checked by the `probe codecov token` and `probe codecov repo` probes; there is no `doctor coverage` yet",
	cache: "checked by the `probe turbo token` probe",
	credentials:
		"`doctor secrets` reads the credentials providers (`credentialsRows()`) and fills its `local` and `dev` columns",
};
