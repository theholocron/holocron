import type { OrgConfig } from "@theholocron/cli";

// Org constants for Sentinel's `holocron.config.ts` (SPEC-0069, #1820): the loader fills the Vercel `teamId` and the
// Checkly `accountId` into the providers that leave them out. Identifiers only, never a secret. The repo root's
// `.holocron/org.ts` holds the Checkly id too, because each config reads only the `.holocron/` beside it. Nothing CI
// needs belongs here (it lives in 1Password and syncs to a GitHub variable). The import is type-only because Sentinel
// evaluates this file remotely.
export default {
	vercel: { teamId: "team_YrFqXg1QceAu0CdYdBmrDpop" },
	checkly: { accountId: "fb82859a-4f62-4773-8404-db0f29f9262c" },
} satisfies OrgConfig;
