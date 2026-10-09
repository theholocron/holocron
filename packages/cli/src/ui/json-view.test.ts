import { afterEach, describe, expect, it, vi } from "vitest";

import { NonInteractiveError } from "../interactive-menu.js";
import { expandToDepth, reduceKey, renderTree, viewJson, type ViewState } from "./json-view.js";

// eslint-disable-next-line no-control-regex
const strip = (s: string): string => s.replace(/\u001b\[[0-9;]*m/g, "");
const texts = (lines: { text: string }[]): string[] => lines.map((l) => strip(l.text));

const sample = { name: "x", n: 1, ok: true, nil: null, empty: {}, list: [1, 2], nested: { a: { b: 1 } } };

describe("renderTree", () => {
	it("collapses containers to a count summary", () => {
		const out = texts(renderTree(sample, { expanded: new Set([""]) }));
		expect(out).toContain('  "list": [… 2 items],');
		expect(out).toContain('  "nested": {… 1 key}');
	});

	it("renders empty containers inline and marks them non-foldable", () => {
		const lines = renderTree(sample, { expanded: new Set([""]) });
		const empty = lines.find((l) => l.path === "/empty");
		expect(strip(empty?.text ?? "")).toBe('  "empty": {},');
		expect(empty?.foldable).toBe(false);
	});

	it("expands to full JSON when everything is expanded", () => {
		const out = texts(renderTree(sample, { expanded: expandToDepth(sample, Infinity) }));
		expect(out.join("\n")).toBe(JSON.stringify(sample, null, 2));
	});

	it("tracks fold state and level on each line", () => {
		const lines = renderTree({ a: [1] }, { expanded: new Set(["", "/a"]) });
		expect(lines.map((l) => [l.level, l.foldable, l.expanded])).toEqual([
			[0, true, true],
			[1, true, true],
			[2, false, false],
			[1, false, false],
			[0, false, false],
		]);
	});
});

describe("expandToDepth", () => {
	it("depth 0 expands nothing; depth 1 expands only the root", () => {
		expect(expandToDepth(sample, 0).size).toBe(0);
		expect([...expandToDepth(sample, 1)]).toEqual([""]);
	});
});

describe("reduceKey", () => {
	const fresh = (): ViewState => ({ cursor: 0, top: 0, expanded: new Set() });

	it("expands the root on right, then moves down", () => {
		let s = reduceKey(fresh(), "right", sample, 10);
		expect(s.expanded.has("")).toBe(true);
		s = reduceKey(s, "down", sample, 10);
		expect(s.cursor).toBe(1);
	});

	it("collapses on left, and jumps to the parent from a leaf", () => {
		let s: ViewState = { cursor: 1, top: 0, expanded: new Set([""]) };
		s = reduceKey(s, "left", sample, 10);
		expect(s.cursor).toBe(0);
		expect(s.expanded.has("")).toBe(true);
		s = reduceKey(s, "left", sample, 10);
		expect(s.expanded.has("")).toBe(false);
	});

	it("clamps the cursor and scrolls the viewport", () => {
		let s: ViewState = { cursor: 0, top: 0, expanded: expandToDepth(sample, Infinity) };
		s = reduceKey(s, "up", sample, 3);
		expect(s.cursor).toBe(0);
		for (let i = 0; i < 5; i++) s = reduceKey(s, "down", sample, 3);
		expect(s.cursor).toBe(5);
		expect(s.top).toBe(3);
	});

	it("expandAll / collapseAll", () => {
		const all = reduceKey(fresh(), "expandAll", sample, 10);
		expect(all.expanded.has("/nested/a")).toBe(true);
		expect(reduceKey(all, "collapseAll", sample, 10).expanded.size).toBe(0);
	});
});

describe("viewJson", () => {
	const original = process.stdout.isTTY;
	afterEach(() => {
		Object.defineProperty(process.stdout, "isTTY", { value: original, configurable: true });
		vi.restoreAllMocks();
	});
	const setTty = (v: boolean): void => {
		Object.defineProperty(process.stdout, "isTTY", { value: v, configurable: true });
	};

	it("emits byte-identical JSON.stringify output when stdout is not a TTY, ignoring depth", async () => {
		setTty(false);
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		await viewJson(sample, { depth: 1 });
		expect(log).toHaveBeenCalledWith(JSON.stringify(sample, null, 2));
	});

	it("collapses past --depth on a TTY", async () => {
		setTty(true);
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		await viewJson(sample, { depth: 1 });
		expect(strip(String(log.mock.calls[0]?.[0]))).toContain('"nested": {… 1 key}');
	});

	it("throws NonInteractiveError for --interactive without a TTY", async () => {
		setTty(false);
		const err = await viewJson(sample, { interactive: true }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
	});

	it("drives the interactive loop and restores the terminal on quit", async () => {
		setTty(true);
		const stdin = process.stdin as unknown as {
			isTTY?: boolean;
			isRaw?: boolean;
			setRawMode: (v: boolean) => void;
		};
		const origTty = stdin.isTTY;
		const origSet = stdin.setRawMode;
		const raw = vi.fn();
		stdin.isTTY = true;
		stdin.setRawMode = raw;
		const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		const resume = vi.spyOn(process.stdin, "resume").mockImplementation(() => process.stdin);
		const pause = vi.spyOn(process.stdin, "pause").mockImplementation(() => process.stdin);
		try {
			const done = viewJson(sample, { interactive: true });
			process.stdin.emit("data", Buffer.from("\u001b[B"));
			process.stdin.emit("data", Buffer.from("\r"));
			process.stdin.emit("data", Buffer.from("q"));
			await done;
			expect(raw.mock.calls.map((c) => c[0])).toEqual([true, undefined]);
			const out = write.mock.calls.map((c) => String(c[0])).join("");
			expect(out).toContain("\u001b[?1049h");
			expect(out.endsWith("\u001b[?25h\u001b[?1049l")).toBe(true);
			expect(resume).toHaveBeenCalled();
			expect(pause).toHaveBeenCalled();
		} finally {
			stdin.isTTY = origTty;
			stdin.setRawMode = origSet;
		}
	});

	it("defaults to the interactive viewer on a full TTY, but not when --depth or --no-interactive is given", async () => {
		setTty(true);
		const stdin = process.stdin as unknown as { isTTY?: boolean; setRawMode: (v: boolean) => void };
		const origTty = stdin.isTTY;
		const origSet = stdin.setRawMode;
		const raw = vi.fn();
		stdin.isTTY = true;
		stdin.setRawMode = raw;
		const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		vi.spyOn(process.stdin, "resume").mockImplementation(() => process.stdin);
		vi.spyOn(process.stdin, "pause").mockImplementation(() => process.stdin);
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			const done = viewJson(sample);
			process.stdin.emit("data", Buffer.from("q"));
			await done;
			expect(raw).toHaveBeenCalledWith(true);
			expect(log).not.toHaveBeenCalled();

			raw.mockClear();
			await viewJson(sample, { depth: 1 });
			await viewJson(sample, { interactive: false });
			expect(raw).not.toHaveBeenCalled();
			expect(log).toHaveBeenCalledTimes(2);
			expect(write.mock.calls.length).toBeGreaterThan(0);
		} finally {
			stdin.isTTY = origTty;
			stdin.setRawMode = origSet;
		}
	});
});
