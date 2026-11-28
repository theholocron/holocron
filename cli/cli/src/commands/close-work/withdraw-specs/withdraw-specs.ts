import type { LoadedConfig } from "../../../config/index.js";
import type { RuntimeContext } from "../../../plugin/index.js";
import { realSpecsSyncIo, runSpecsSync } from "../../specs-sync/index.js";
import type { WithdrawSpecsReport } from "../run-close-work/index.js";

/**
 * `sync specs --withdraw --files <paths>` run in this process: tags each spec's discussion post `withdrawn` and closes
 * it. Its own lines are kept, not printed, so `close work` prints one table; a dry run goes through the context.
 */
export async function withdrawSpecs(
	loaded: LoadedConfig,
	context: RuntimeContext,
	files: string[]
): Promise<WithdrawSpecsReport> {
	const lines: string[] = [];
	const report = await runSpecsSync({
		loaded,
		context,
		io: realSpecsSyncIo(context.repoRoot),
		files,
		withdraw: true,
		print: (line) => void lines.push(line),
	});
	if (report.status === "fail") {
		const problems = report.files.flatMap((f) => (f.problem ? [`${f.path}: ${f.problem}`] : []));
		return { ok: false, detail: report.message ?? (problems.join("; ") || "the sync failed") };
	}
	const did = report.files.flatMap((f) => f.did);
	return { ok: true, detail: did.length > 0 ? did.join("; ") : "the post is already withdrawn" };
}
