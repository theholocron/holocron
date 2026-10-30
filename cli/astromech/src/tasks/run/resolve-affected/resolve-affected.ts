import type { ExecFn } from "../run.type.js";

/** Branches that releases are cut from: on a push to one, HEAD equals the base, so nothing would be "affected". */
const RELEASE_BRANCHES = new Set(["main", "alpha"]);

export interface ResolveAffectedInput {
	/** `--affected` was asked for. */
	affected?: boolean;
	/** `--base <ref>`; wins over `TURBO_SCM_BASE`. */
	base?: string;
	env: Record<string, string | undefined>;
	exec: ExecFn;
	cwd: string;
}

export interface AffectedPlan {
	/** Append `--affected` to `turbo run`. */
	affected: boolean;
	/** Env for the turbo child; carries `TURBO_SCM_BASE` when the base came from `--base`. */
	env?: Record<string, string>;
	/** One line explaining why `--affected` was dropped, for the caller to print. */
	notice?: string;
}

/**
 * Decide whether `turbo run` gets `--affected`, and against which base.
 *
 * `--affected` is dropped (everything runs, the safe direction) on a push to a
 * release branch, and when the base ref is missing or not in this checkout —
 * raw turbo would error on that, a shallow CI clone must not.
 */
export function resolveAffected(input: ResolveAffectedInput): AffectedPlan {
	if (!input.affected) return { affected: false };

	const { env, exec, cwd } = input;
	const branch = env.GITHUB_REF_NAME;
	if (env.GITHUB_EVENT_NAME === "push" && branch !== undefined && RELEASE_BRANCHES.has(branch)) {
		return { affected: false, notice: `--affected ignored on a push to ${branch}: running everything` };
	}

	const base = input.base ?? env.TURBO_SCM_BASE;
	if (!base) {
		return {
			affected: false,
			notice: "--affected ignored: no base given (--base or TURBO_SCM_BASE); running everything",
		};
	}
	if (exec("git", ["cat-file", "-e", `${base}^{commit}`], { cwd }).exitCode !== 0) {
		return {
			affected: false,
			notice: `--affected ignored: base "${base}" is not in this checkout (fetch more history); running everything`,
		};
	}
	return { affected: true, env: { TURBO_SCM_BASE: base } };
}
