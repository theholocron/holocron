import type { LoadHookSync } from "node:module";
import { fileURLToPath } from "node:url";

import { transformTemplate } from "@theholocron/rollup-plugin-transform-template";

const template = transformTemplate();

/**
 * Node `load` hook that turns a text file the source imports (`.holocron/org.md`) into a module exporting its text,
 * the way the build does (`transformTemplate`, the same plugin tsdown and vitest use). Without it, running the CLI
 * from source through `tsx` stops on `Unknown file extension ".md"`.
 */
export const textImportLoad: LoadHookSync = (url, context, nextLoad) => {
	if (!url.startsWith("file:")) return nextLoad(url, context);
	const transformed = template.transform("", fileURLToPath(url));
	if (!transformed) return nextLoad(url, context);
	return { format: "module", source: transformed.code, shortCircuit: true };
};
