import type { Source } from "../../capabilities/index.js";
import { ProviderApiError } from "../../capabilities/index.js";
import type { SetupStepResult } from "./run-step.js";

export const RULESET_NAME = "holocron-default-branch";

export function buildClassicProtectionPayload(requiredChecks: string[] = []): Record<string, unknown> {
	return {
		required_status_checks: requiredChecks.length > 0 ? { strict: false, contexts: requiredChecks } : null,
		enforce_admins: false,
		required_pull_request_reviews: {
			required_approving_review_count: 0,
			dismiss_stale_reviews: false,
			require_code_owner_reviews: false,
		},
		restrictions: null,
		allow_force_pushes: false,
		allow_deletions: false,
	};
}

export function buildRulesetPayload(requiredChecks: string[] = []): Record<string, unknown> {
	const rules: Record<string, unknown>[] = [
		{ type: "deletion" },
		{ type: "non_fast_forward" },
		{
			type: "pull_request",
			parameters: {
				required_approving_review_count: 0,
				dismiss_stale_reviews_on_push: false,
				require_code_owner_review: false,
				require_last_push_approval: false,
				required_review_thread_resolution: true,
			},
		},
	];
	if (requiredChecks.length > 0) {
		rules.push({
			type: "required_status_checks",
			parameters: {
				required_status_checks: requiredChecks.map((context) => ({ context })),
				strict_required_status_checks_policy: false,
			},
		});
	}
	return {
		name: RULESET_NAME,
		target: "branch",
		enforcement: "active",
		// Repository admins (role 4) can bypass — required for semantic-release
		// and other automation that pushes directly to the default branch.
		bypass_actors: [{ actor_id: 4, actor_type: "RepositoryRole", bypass_mode: "always" }],
		conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
		rules,
	};
}

// Tries the modern Rulesets API first, falls back to classic branch protection
// if rulesets return 403 (requires GitHub Team+ on private repos), and gracefully
// skips if both APIs are unavailable (GitHub Free on private repos).
export async function upsertBranchProtection(
	source: Source,
	dryRun: boolean,
	requiredChecks: string[]
): Promise<SetupStepResult> {
	const step = `upsert ruleset ${RULESET_NAME}`;
	if (dryRun) return { capability: "source", step, status: "dry-run" };

	// Attempt 1: modern rulesets
	try {
		const existing = await source.listRulesets();
		const found = existing.find((r) => r.name === RULESET_NAME);
		if (found) {
			await source.updateRuleset(found.id, buildRulesetPayload(requiredChecks));
			return { capability: "source", step, status: "ok", message: "updated" };
		}
		await source.createRuleset(buildRulesetPayload(requiredChecks));
		return { capability: "source", step, status: "ok", message: "created" };
	} catch (err) {
		if (!(err instanceof ProviderApiError) || err.status !== 403) {
			return {
				capability: "source",
				step,
				status: "fail",
				message: err instanceof Error ? err.message : String(err),
			};
		}
	}

	// Attempt 2: classic branch protection (free-plan fallback)
	try {
		const repo = await source.getRepo();
		await source.protectBranch(repo.defaultBranch, buildClassicProtectionPayload(requiredChecks));
		return { capability: "source", step, status: "ok", message: `classic protection on ${repo.defaultBranch}` };
	} catch (err) {
		if (err instanceof ProviderApiError && err.status === 403) {
			return {
				capability: "source",
				step,
				status: "skip",
				message: "branch protection unavailable on private repos without GitHub Pro/Team",
			};
		}
		return {
			capability: "source",
			step,
			status: "fail",
			message: err instanceof Error ? err.message : String(err),
		};
	}
}
