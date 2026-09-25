/**
 * This App's brand name. No longer prefixed onto check-run names — GitHub's
 * own check-run detail page already shows the posting App's display name
 * ("The Holocron Sentinel") ahead of whatever name is set here, so a
 * hand-added "Sentinel /" prefix just duplicated it (found live: "The
 * Holocron Sentinel / Sentinel / Platform / ..."). Still used for anything
 * that isn't rendered next to GitHub's own App-name UI (log messages, etc).
 */
export const SENTINEL_APP_NAME = "Sentinel";

/**
 * Humanized display form of each `astromech` task namespace prefix Sentinel
 * carries through a check-run name (D5, `tech-sentinel-enforcement.spec.md`:
 * `<namespace, humanized> / <the existing CI check's own name>` — no
 * "Sentinel /" prefix, per the constant above). Keyed by the same prefix
 * the task itself uses (`platform.commitStandards` → `platform`), so a
 * future check adds one entry here instead of a second hand-typed copy of
 * the string.
 */
export const SENTINEL_NAMESPACES = {
	platform: "Platform",
	verification: "Verification",
} as const satisfies Record<string, string>;

/**
 * `details_url` target for every check run Sentinel posts — the Axiom
 * dataset its own structured logs ship to (holocron#780). A check run
 * posted directly via the Checks API (no workflow run behind it) has no
 * GitHub-native log viewer to link to on its own; this is the closest
 * equivalent. Each check run's own `output.text` also carries its
 * `runId` so a viewer can search this dataset for the exact invocation.
 */
export const SENTINEL_AXIOM_DATASET_URL = "https://app.axiom.co/the-holocron-7bbe/datasets/holocron-sentinel";

/**
 * Where the Bucket 2 dispatch mechanism's shared workflow lives
 * (holocron#769, holocron#794, `tech-sentinel-ci-runner.spec.md`) — one
 * `workflow_dispatch`-triggered workflow in `theholocron/.github`, always
 * dispatched against its own default branch. Never the *target* repo the
 * dispatch checks out — that's a per-call `repo`/`ref` input, not this.
 */
export const SENTINEL_DISPATCH_REPO = "theholocron/.github";
export const SENTINEL_DISPATCH_WORKFLOW_FILE = "platform.dispatchedCheck.yml";
export const SENTINEL_DISPATCH_REF = "main";

/**
 * The one Bucket 2 task this prototype phase dispatches (holocron#769,
 * `tech-sentinel-ci-runner.spec.md`'s explicit scope: "one Bucket 2 tool
 * prototype against tsc"). Only fires for a repo whose `holocron.config`
 * actually declares this task — every other repo is untouched. Runs
 * *alongside* the existing GitHub Actions thin-caller for the same task,
 * not instead of it, until this mechanism is trusted enough to replace it.
 *
 * Check name matches the same `<Namespace> / <label> / <command>` shape
 * every other Sentinel-posted check uses (see `SENTINEL_NAMESPACES`), and
 * mirrors the native thin-caller check's own command name ("Run tsc
 * --noEmit") for a task that only ever has one dispatchable command today.
 */
export const SENTINEL_DISPATCHABLE_TASK = "verification.typeSafety";
export const SENTINEL_DISPATCHED_CHECK_NAME = `${SENTINEL_NAMESPACES.verification} / Type Safety / Run tsc --noEmit`;
