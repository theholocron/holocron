import { blockedAutoFixKinds } from "../blocked-auto-fix-kinds/index.js";
import type { FindAutoFixLoopInput, FindAutoFixLoopResult } from "./find-auto-fix-loop.type.js";

/**
 * Reads the pull request's commits and says which auto-fixers must not commit again (see
 * {@link blockedAutoFixKinds}). GitHub lists a pull request's first 100 commits, so a pull request longer than
 * that is read from a tail that is not its own and may not be guarded; it throws on an API failure, and the caller
 * treats that as "nothing blocked", like every other soft-skipped step.
 */
export async function findAutoFixLoop(input: FindAutoFixLoopInput): Promise<FindAutoFixLoopResult> {
	const { client, repo, pullNumber } = input;
	const commits = await client.pulls.listCommits(repo, pullNumber);
	return { blocked: blockedAutoFixKinds(commits.map((c) => c.commit.message)) };
}
