import type { ProbeRow } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import type { BackfillApi, LabelsConfig } from "./issue-types.type.js";

/** Where a repository without a `package.json` declares `repo.labels` (the `repo` area file, spec `tech-holocron-directory`). */
const AREA_FILE_JSON = ".holocron/repo.json";
const AREA_FILE_TS = ".holocron/repo.ts";

/** What was found of another repository's area labels: what to use (`{}` for none) and the row that says how. */
export interface RepoAreas {
	areas: LabelsConfig;
	row: ProbeRow;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** `repo.labels.areas` and `scopes` as the mapping reads them, or `undefined` for a shape it cannot use. */
function areaMap(labels: unknown): LabelsConfig | undefined {
	if (!isRecord(labels) || !isRecord(labels.areas) || Object.keys(labels.areas).length === 0) return undefined;
	const areas = labels.areas;
	if (!Object.values(areas).every((p) => Array.isArray(p) && p.every((x) => typeof x === "string"))) return undefined;
	const scopes = isRecord(labels.scopes) ? labels.scopes : {};
	if (!Object.values(scopes).every((a) => typeof a === "string")) return undefined;
	return { areas: areas as Record<string, string[]>, scopes: scopes as Record<string, string> };
}

const none = (detail: string): RepoAreas => ({ areas: {}, row: { status: "info", label: "area labels", detail } });

/**
 * The area labels another repository declares (spec `tech-backfill-config-mapping`), read from its own
 * `.holocron/repo.json`. A `.holocron/repo.ts` is TypeScript, which only Sentinel's remote config reader evaluates and a
 * plugin cannot reach, so that repository gets a skipped row and no area step; so does one with no declaration. Never
 * throws for a missing or unusable file: the Type step of the repository still runs.
 */
export async function readRepoAreas(api: Pick<BackfillApi, "readFile">): Promise<RepoAreas> {
	const json = await api.readFile(AREA_FILE_JSON);
	if (json !== null) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(json);
		} catch (err) {
			return {
				areas: {},
				row: {
					status: "fail",
					label: "area labels",
					detail: `${AREA_FILE_JSON} is not JSON (${errorMessage(err)})`,
				},
			};
		}
		const found = areaMap(isRecord(parsed) ? parsed.labels : undefined);
		return found
			? { areas: found, row: { status: "info", label: "area labels", detail: `read from ${AREA_FILE_JSON}` } }
			: none(`skipped: ${AREA_FILE_JSON} declares no usable \`labels.areas\`, so no area labels are added`);
	}
	if ((await api.readFile(AREA_FILE_TS)) !== null) {
		return none(
			`skipped: its areas are in ${AREA_FILE_TS}, which is TypeScript the probe cannot evaluate (only Sentinel's config reader does); no area labels are added`
		);
	}
	return none(`skipped: it has no ${AREA_FILE_JSON} or ${AREA_FILE_TS}, so no area labels are added`);
}
