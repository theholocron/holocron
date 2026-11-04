import type { CiHome } from "../ci-ref/index.js";
import { CI_HOME, TEMPLATE_HOME } from "../ci-ref/index.js";

/**
 * The composite actions that exist only in `theholocron/holocron`: `theholocron/.github` is frozen and never got a copy.
 * The repo that hosts them runs these from its own checkout.
 */
const ACTIONS_WITHOUT_FROZEN_COPY: ReadonlySet<string> = new Set(["format"]);

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `text` (a reusable workflow already moved to `home`) with its composite-action references made resolvable in the repo
 * that hosts the reusables, before `ci-v1` exists to resolve `theholocron/holocron/ci/actions/<name>@ci-v1`: an action
 * with no frozen copy is called by path from the checkout (`./ci/actions/format`), every other one keeps the frozen
 * copy in `theholocron/.github` at `main`, which is what it ran before the home moved. Only the copies this repo writes
 * to its own `.github/workflows` go through here; the reusables other repos call keep the `home` reference. Once the tag
 * exists the frozen spelling can go (the nested references inside `ci/actions` follow it).
 */
export function hostedActionRefs(text: string, home: CiHome = CI_HOME): string {
	const reference = new RegExp(`${escaped(home.actions)}/([\\w.-]+)@${escaped(home.ref)}`, "g");
	return text.replace(reference, (_all, name: string) =>
		ACTIONS_WITHOUT_FROZEN_COPY.has(name)
			? `./ci/actions/${name}`
			: `${TEMPLATE_HOME.actions}/${name}@${TEMPLATE_HOME.ref}`
	);
}
