import { createHeader } from "../../../utils/create-header.js";
import codecovTemplate from "./codecov.yml";
import { codecovComponentBlock } from "./utils.js";

const { scaffoldHeader } = createHeader({
	source: "packages/cli/src/templates/configs/codecov/create-config.ts",
});

export function createConfig(packages: import("./utils.js").WorkspacePackage[]): string {
	return `${scaffoldHeader()}${codecovTemplate.trimEnd()}${codecovComponentBlock(packages)}`;
}
