import type { CliEnv } from "../../env.js";
import type { PublishPrint } from "./publish.type.js";

export function printNextSteps(
	print: PublishPrint,
	env: CliEnv,
	packageNames: readonly string[],
	repoName: string
): void {
	print("");
	print("  → next: configure Trusted Publisher for each package on npm:");
	for (const name of packageNames) {
		print(`    https://www.npmjs.com/package/${name}/access`);
	}
	print(`    Publisher: GitHub Actions   Org: theholocron   Repo: ${repoName}   Workflow: delivery.publish.yml`);

	if (env.get("NPM_TOKEN")) {
		print("");
		print("  → cleanup: $NPM_TOKEN was used. Revoke it now (no API for self-revoke; UI-only):");
		print("    https://www.npmjs.com/settings/~/tokens");
	}
}
