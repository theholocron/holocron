import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { CiIo } from "./doctor-ci.type.js";

/** `doctor ci`'s inputs from the real `.github/workflows` under `repoRoot`. */
export function realCiIo(repoRoot: string): CiIo {
	/* v8 ignore start -- reads the real filesystem; the check is tested with an injected io */
	return {
		workflows: () => {
			const dir = join(repoRoot, ".github", "workflows");
			try {
				return readdirSync(dir)
					.filter((file) => file.endsWith(".yml"))
					.sort()
					.map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") }));
			} catch {
				return [];
			}
		},
	};
	/* v8 ignore stop */
}
