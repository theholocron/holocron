import type { CallerHome } from "./doctor-ci.type.js";

/** Where a job's `uses:` value is hosted: the frozen copies in `theholocron/.github`, holocron at `ci-v1`, this repo, or elsewhere. */
export function homeOf(uses: string): CallerHome {
	if (uses.startsWith("./.github/workflows/")) return "local";
	if (uses.startsWith("theholocron/.github/.github/workflows/")) return "legacy";
	if (uses.startsWith("theholocron/holocron/.github/workflows/") && uses.endsWith("@ci-v1")) return "ci-v1";
	return "other";
}
