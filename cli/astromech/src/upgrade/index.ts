export { detectNodeMajor } from "./detect-node-major/index.js";
export { fetchLatestFromNpm } from "./fetch-latest-from-npm/index.js";
export { patchDockerfile } from "./patch-dockerfile/index.js";
export { patchPackageJson } from "./patch-package-json/index.js";
export { patchPinFile } from "./patch-pin-file/index.js";
export { patchToolVersions } from "./patch-tool-versions/index.js";
export { patchYaml } from "./patch-yaml/index.js";
export type {
	NodePinPattern,
	RunUpgradeNodeInput,
	UpgradeNodeLogger,
	UpgradeNodeReport,
	UpgradeNodeStatus,
} from "./upgrade-node/index.js";
export { runUpgradeNode } from "./upgrade-node/index.js";
