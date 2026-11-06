import { createHeader } from "../../../utils/index.js";
import dcoBody from "./dco.yml";

const { workflowHeader } = createHeader({
	source: "cli/astromech/src/templates/configs/dco/create-config.ts",
});

/** The `.github/dco.yml` body, which lets a maintainer remediate a missing sign-off with a follow-up commit. */
export function createConfig(): string {
	return `${workflowHeader()}${dcoBody}`;
}
