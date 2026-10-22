import type { CliEnv } from "../../env/index.js";
import type { PublishPrint } from "./publish.type.js";
import type { RepoIdentity } from "./resolve-repo-identity.type.js";

export function printNextSteps(
	print: PublishPrint,
	env: CliEnv,
	packageNames: readonly string[],
	identity: RepoIdentity
): void {
	print("");
	print("→ next: configure Trusted Publisher for each package on npm:");
	print("    Publisher: GitHub Actions");
	print("    Label: Holocron Release");
	print(`    Organization: ${identity.owner}`);
	print(`    Repository: ${identity.repo}`);
	print("    Workflow filename: delivery.publish.yml");
	print("");
	print("→ packages to be published:");
	for (const name of packageNames) {
		print(`    https://www.npmjs.com/package/${name}/access`);
	}

	if (env.get("NPM_TOKEN")) {
		print("");
		print("→ cleanup: $NPM_TOKEN was used. Revoke it now (no API for self-revoke; UI-only):");
		print("    https://www.npmjs.com/settings/~/tokens");
	}
}
