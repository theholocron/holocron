import type { ConfigDirArea } from "@theholocron/datapad";
import { describe, expect, it } from "vitest";

import type { HolocronConfig } from "../../config/index.js";
import { placeAreas } from "./place-areas.js";

const file = (area: string, value: unknown): ConfigDirArea => ({
	area,
	path: `.holocron/${area}.json`,
	extension: "json",
	filepath: `/x/.holocron/${area}.json`,
	value,
});

describe("placeAreas", () => {
	it("returns the config untouched when there are no areas", () => {
		const raw: HolocronConfig = { name: "demo", providers: {}, repo: { topics: ["x"] } };
		expect(placeAreas([], raw)).toBe(raw);
	});

	it("ignores an area it has no rule for", () => {
		const raw: HolocronConfig = { name: "demo", providers: {} };
		expect(placeAreas([file("projects", {})], raw)).toBe(raw);
	});

	it("puts the layout on the first discord entry of a provider list", () => {
		const raw: HolocronConfig = { providers: { notifications: ["slack", ["discord", { guildId: "1" }]] } };
		const placed = placeAreas([file("notifications", { a: 1 })], raw);
		expect(placed.providers?.notifications).toEqual(["slack", ["discord", { guildId: "1", layout: { a: 1 } }]]);
		expect(raw.providers?.notifications).toEqual(["slack", ["discord", { guildId: "1" }]]);
	});

	it("errors when the provider list has no discord entry", () => {
		const raw: HolocronConfig = { providers: { notifications: ["slack", "teams"] } };
		expect(() => placeAreas([file("notifications", {})], raw)).toThrow(/no discord entry/);
	});

	it("errors when a discord entry in a list already has a layout", () => {
		const raw: HolocronConfig = { providers: { notifications: ["slack", ["discord", { layout: {} }]] } };
		expect(() => placeAreas([file("notifications", {})], raw)).toThrow(/set in providers\.notifications and in/);
	});

	it("errors when the notifications file is not an object", () => {
		expect(() => placeAreas([file("notifications", "x")], { providers: { notifications: "discord" } })).toThrow(
			/must export the notifications layout as an object/
		);
	});
});
