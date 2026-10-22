import { beforeEach, describe, expect, it, vi } from "vitest";

const searchMock = vi.fn();
vi.mock("@inquirer/search", () => ({ default: (...args: unknown[]) => searchMock(...args) }));

const { pickMenuItem, searchChoices } = await import("./menu.js");
import type { MenuItem } from "./menu.type.js";

const items: MenuItem[] = [
	{
		name: "clone",
		value: "clone",
		description: "Clone a repo or every repo in an org",
		haystack: "clone clone a repo or every repo in an org",
	},
	{ name: "doctor", value: "doctor", description: "Check setup health", haystack: "doctor check setup health" },
	{
		name: "repo ›",
		value: "group:repo",
		description: "setup, sync, upgrade",
		haystack: "repo setup set up a repo repo sync repo upgrade",
	},
	{
		name: "secrets ›",
		value: "group:secrets",
		description: "set, sync",
		haystack: "secrets set secrets sync push deployment env vars",
	},
];

describe("pickMenuItem", () => {
	beforeEach(() => searchMock.mockReset());

	it("resolves to the picked item's value", async () => {
		searchMock.mockResolvedValue("group:repo");
		expect(await pickMenuItem(items)).toBe("group:repo");
	});

	it("passes the message through to search()", async () => {
		searchMock.mockResolvedValue("doctor");
		await pickMenuItem(items, "choose a subcommand:");
		expect(searchMock).toHaveBeenCalledWith(expect.objectContaining({ message: "choose a subcommand:" }));
	});

	it("wires its `source` callback straight to searchChoices", async () => {
		searchMock.mockResolvedValue("doctor");
		await pickMenuItem(items);
		const { source } = searchMock.mock.calls[0]![0] as {
			source: (term: string | undefined) => ReturnType<typeof searchChoices>;
		};
		expect(source("doctor")).toEqual(searchChoices(items, "doctor"));
	});
});

describe("searchChoices — the `source` callback pickMenuItem hands to search()", () => {
	it("returns every item when the term is empty or undefined", () => {
		expect(searchChoices(items, undefined)).toHaveLength(items.length);
		expect(searchChoices(items, "")).toHaveLength(items.length);
	});

	it("filters out items that match neither the name nor the description", () => {
		expect(searchChoices(items, "zzz-no-such-command")).toEqual([]);
	});

	it("matches the name case-insensitively", () => {
		expect(searchChoices(items, "DOCTOR").map((c) => c.value)).toEqual(["doctor"]);
	});

	it("also matches on the description, not just the name", () => {
		expect(searchChoices(items, "deployment env vars").map((c) => c.value)).toContain("group:secrets");
	});

	it("finds a nested command from the top by name: `upgrade` surfaces the repo group", () => {
		expect(searchChoices(items, "upgrade").map((c) => c.value)).toContain("group:repo");
	});

	it("ranks name matches above description-only matches (typing `repo` lands on the repo group, not clone)", () => {
		const values = searchChoices(items, "repo").map((c) => c.value);
		expect(values[0]).toBe("group:repo");
		expect(values).toContain("clone");
		expect(values.indexOf("group:repo")).toBeLessThan(values.indexOf("clone"));
	});

	it("ranks a name prefix above a name substring (`up` → upgrade before setup)", () => {
		const level: MenuItem[] = [
			{ name: "setup", value: "repo setup", description: "Set up a repo", haystack: "setup set up a repo" },
			{ name: "upgrade ›", value: "group:repo upgrade", description: "node", haystack: "upgrade node" },
		];
		expect(searchChoices(level, "up").map((c) => c.value)).toEqual(["group:repo upgrade", "repo setup"]);
	});

	it("each choice carries name, value, description, and short", () => {
		const [choice] = searchChoices(items, "doctor");
		expect(choice).toEqual({
			name: "doctor",
			value: "doctor",
			description: "Check setup health",
			short: "doctor",
		});
	});

	it("strips a group's trailing › from short, so the completed-answer echo doesn't show it (the live list's name keeps it)", () => {
		const [choice] = searchChoices(items, "repo");
		expect(choice).toEqual(expect.objectContaining({ name: "repo ›", value: "group:repo", short: "repo" }));
	});

	it("leaves short equal to name for a non-group item (no trailing ›)", () => {
		const [choice] = searchChoices(items, "doctor");
		expect(choice.name).toBe(choice.short);
	});
});
