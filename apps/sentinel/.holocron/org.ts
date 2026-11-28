import type { OrgConfig } from "@theholocron/cli";

// Org constants for Sentinel's `holocron.config.ts` (SPEC-0069, #1820): the loader fills the Vercel `teamId` into the
// provider that leaves it out. Identifiers only, never a secret. Only what is Sentinel's own is here: the org area is
// shared, so the repo root's `.holocron/org.ts` supplies the rest (the Checkly `accountId`), and a key set in both files
// takes this file's value (#1829). Nothing CI needs belongs here (it lives in 1Password and syncs to a GitHub
// variable). The import is type-only because Sentinel evaluates this file remotely.
export default {
	vercel: { teamId: "team_YrFqXg1QceAu0CdYdBmrDpop" },
} satisfies OrgConfig;
