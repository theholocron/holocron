import type { OrgConfig } from "@theholocron/cli";

// The organization's constants that are provider options, filled into a provider entry that leaves the option out of
// `holocron.config.ts` (SPEC-0069, #1820). Identifiers only, never a secret. NOT here: anything CI needs
// (`CLOUDFLARE_ACCOUNT_ID`, `TURBO_TEAM`, `AXIOM_DATASET`); those live in 1Password and sync to a GitHub variable
// (`repo.variables.sync` in `.holocron/repo.ts`), and nothing else carries a copy. A value set here and inline in the
// config is an error. A config reads only the `.holocron/` beside it, so `apps/sentinel/.holocron/org.ts` holds the
// values Sentinel's config needs. The import is type-only because Sentinel evaluates this file remotely.
export default {
	checkly: { accountId: "fb82859a-4f62-4773-8404-db0f29f9262c" },
} satisfies OrgConfig;
