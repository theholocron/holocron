import type { Logger } from "@theholocron/observability/core";

import { style } from "../../../ui/index.js";
import type { ProjectRows } from "./project-rows.type.js";

/** Rows in the repo's `ok / fail / skip` style; the report is `fail` when any row failed. */
export function createProjectRows(print: (line: string) => void, logger: Logger | undefined): ProjectRows {
	const summary = { ok: 0, fail: 0, skip: 0 };
	const text = (label: string, detail: string | undefined) =>
		detail ? `${label}  ${style.dim(`(${detail})`)}` : label;
	return {
		ok(label, detail) {
			summary.ok += 1;
			print(`  ${style.success(text(label, detail))}`);
		},
		fail(label, detail) {
			summary.fail += 1;
			print(`  ${style.fail(text(label, detail))}`);
		},
		skip(label, detail) {
			summary.skip += 1;
			print(`  ${style.skip(text(label, detail))}`);
		},
		line: (line) => print(line),
		finish(command) {
			print("");
			const line = `${summary.ok} ok, ${summary.fail} failed, ${summary.skip} skipped`;
			print(summary.fail > 0 ? style.fail(line) : style.success(line));
			const status = summary.fail > 0 ? "fail" : "ok";
			logger?.[status === "ok" ? "info" : "warn"]({ status, ...summary }, command);
			return { status, summary };
		},
	};
}
