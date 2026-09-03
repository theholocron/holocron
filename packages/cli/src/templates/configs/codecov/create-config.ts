import { createHeader } from "../../../utils/create-header.js";
import { codecovComponentBlock } from "./utils.js";
import codecovTemplate from "./codecov.yml";

const { scaffoldHeader } = createHeader({
	source: "packages/cli/src/templates/configs/codecov/create-config.ts",
});

export function createConfig(packages: import("./utils.js").WorkspacePackage[]): string {
	return `${scaffoldHeader()}${codecovTemplate.trimEnd()}${codecovComponentBlock(packages)}`;
}
