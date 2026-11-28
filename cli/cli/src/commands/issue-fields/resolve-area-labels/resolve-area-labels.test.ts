import { describe, expect, it } from "vitest";

import { resolveAreaLabels } from "./resolve-area-labels.js";

const AREAS = { cli: ["cli/**"], Sentinel: ["apps/sentinel/**"] };

describe("resolveAreaLabels", () => {
	it("makes no label for no names, declared or not", () => {
		expect(resolveAreaLabels([], undefined)).toEqual({ ok: true, labels: [] });
	});

	it("makes the label of each declared area, once, whatever the case and with or without the prefix", () => {
		expect(resolveAreaLabels(["CLI", "area:cli", "sentinel"], AREAS)).toEqual({
			ok: true,
			labels: ["area:cli", "area:Sentinel"],
		});
	});

	it("refuses a name the repo does not declare, and lists the declared ones", () => {
		expect(resolveAreaLabels(["nope"], AREAS)).toEqual({
			ok: false,
			problem: 'unknown area "nope"; the declared areas are cli, Sentinel',
		});
	});

	it("refuses when the config has no label map at all", () => {
		expect(resolveAreaLabels(["cli"], undefined)).toMatchObject({ ok: false });
	});

	it("refuses when the repo declares no areas", () => {
		const result = resolveAreaLabels(["cli"], {});
		expect(result.ok).toBe(false);
		expect((result as { problem: string }).problem).toMatch(/declares none/);
	});
});
