import { LEGACY_NAMES } from "../legacy-names/index.js";

/** Each flat id and the old name that listed it (no id is listed under two). */
const BY_ID = new Map<string, string>(
	Object.entries(LEGACY_NAMES).flatMap(([legacy, targets]) => targets.map(({ id }) => [id, legacy] as const))
);

/**
 * The old name a flat id replaced — `test:unit` is `verification.unitTests`. It is what the generated workflow files,
 * `turbo.json` tasks and `package.json` scripts are still called until the later phases rename them, so generators
 * translate through it and the files do not change. `undefined` for an id that never had an old name (`preview`).
 * `format` and the other formatting successors share the formatting workflow's name.
 */
export function legacyName(id: string): string | undefined {
	return BY_ID.get(id);
}

/**
 * The old name a flat id replaced, only when that name stood for this id alone. `format` and `lint:markdown` are halves
 * of `sourceQuality.formatting`, so a turbo task or script of that name is not theirs to run.
 */
export function ownLegacyName(id: string): string | undefined {
	const legacy = BY_ID.get(id);
	return legacy !== undefined && LEGACY_NAMES[legacy]!.length === 1 ? legacy : undefined;
}
