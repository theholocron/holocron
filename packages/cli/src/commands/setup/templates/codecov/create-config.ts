import { createHeader } from "../../../../create-header/index.js";
import { codecovComponentBlock } from "./utils.js";
import codecovTemplate from "./codecov.yml";

const { scaffoldHeader } = createHeader({
	source: "packages/cli/src/commands/setup/templates/codecov/create-config.ts",
});

export function createConfig(packages: import("./utils.js").WorkspacePackage[]): string {
	return scaffoldHeader() + codecovTemplate.trimEnd() + codecovComponentBlock(packages);
}
