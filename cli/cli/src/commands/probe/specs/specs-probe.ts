import { ADR_DIR, checkSpecs, SPEC_DIRS, type SpecFile } from "@theholocron/astromech/repo-validation";

import type { PluginProbes, Probe } from "../../../plugin/index.js";
import type { SpecsAnnounceIo, SpecsIo } from "./specs.type.js";
import { specsAnnounceProbe } from "./specs-announce-probe.js";

/** The group of probes that check the repo's written decisions and designs. */
export const SPECS_PROVIDER = "specs";

/** The files to read: the ones named, or every file in the ADR and spec folders. A named file that is gone is dropped. */
function filesToRead(args: readonly string[], io: SpecsIo): SpecFile[] {
	const paths =
		args.length > 0
			? args.map((arg) => io.repoPath(arg))
			: [ADR_DIR, ...SPEC_DIRS].flatMap((dir) =>
					io
						.list(dir)
						.sort()
						.map((name) => `${dir}/${name}`)
				);
	return paths.flatMap((path) => {
		const text = io.read(path);
		return text === undefined ? [] : [{ path, text }];
	});
}

/**
 * `specs check [files...]`: validates the frontmatter of the ADRs (`docs/wiki/decisions/*.md`, other than the template and
 * the README) and specs (`.notes/*.spec.md` and `docs/wiki/specifications/*.spec.md`). Without files it reads every ADR
 * and spec; with files it checks the ones among them that are an ADR or a spec, and ignores the rest. An error fails
 * the run (a bad or missing `id`, `title`, `status` or `date`, an unknown status, no frontmatter); a warning is
 * reported and never fails it (an accepted ADR with no discussion link, a spec with no issue). This is the `adrs` job of
 * `platform.repoValidation`; the rules are `checkSpecs` in `@theholocron/astromech/repo-validation`, which Sentinel runs on
 * a pull request's files too.
 */
export function specsCheckProbe(io: SpecsIo): Probe {
	return {
		summary:
			"Fail for each ADR or spec with bad frontmatter; warn on a missing discussion link or issue (CI runs this).",
		writes: false,
		async run(ctx) {
			ctx.say({ status: "heading", label: "ADRs and specs" });
			const { fileCount, findings } = checkSpecs(filesToRead(ctx.args ?? [], io));
			for (const f of findings) {
				ctx.say({
					status: f.severity === "error" ? "fail" : "info",
					label: `${f.file}:${f.line}`,
					detail: `${f.reason} [${f.rule}]`,
				});
			}
			const errors = findings.filter((f) => f.severity === "error").length;
			const counts = `${fileCount} file(s) checked, ${errors} error(s), ${findings.length - errors} warning(s)`;
			ctx.say({ status: errors === 0 ? "ok" : "info", label: "frontmatter", detail: counts });
		},
	};
}

/** The `specs` probes: the ADR and spec frontmatter check, over `io`, and the #ideas announcement, over `announceIo`. */
export function specsProbes(io: SpecsIo, announceIo: SpecsAnnounceIo): PluginProbes {
	return { check: specsCheckProbe(io), announce: specsAnnounceProbe(announceIo) };
}
