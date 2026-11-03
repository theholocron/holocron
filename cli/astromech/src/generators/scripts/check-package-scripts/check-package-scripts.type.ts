/** Where a `package.json` sits in the repo: the root (which holds the suite scripts) or any other package. */
export type PackageRole = "root" | "package";

/** One thing wrong with a script. `warn` is a deprecated spelling accepted for a window; `fail` breaks a rule. */
export interface PackageScriptProblem {
	level: "warn" | "fail";
	script: string;
	message: string;
}
