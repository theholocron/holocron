import { scaffoldHeader } from "../../../setup-workflows.js";
import { codecovComponentBlock } from "./utils.js";
import codecovTemplate from "./codecov.yml";

export function createConfig(packages: import("./utils.js").WorkspacePackage[]): string {
	return scaffoldHeader("packages/cli/src/commands/setup/templates/codecov/create-config.ts") + codecovTemplate.trimEnd() + codecovComponentBlock(packages);
}
