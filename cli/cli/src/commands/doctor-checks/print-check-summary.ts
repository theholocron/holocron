import { style } from "../../ui/style/index.js";
import type { CheckSummary } from "./doctor-checks.type.js";

/** A blank line, then the closing `N ok, N fail, N skipped`. */
export function printCheckSummary(summary: CheckSummary, print: (line: string) => void): void {
	print("");
	print(style.header(`${summary.ok} ok, ${summary.fail} fail, ${summary.skip} skipped`));
}
