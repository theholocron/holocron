import chalk from "chalk";

import { NonInteractiveError } from "../interactive-menu.js";

/** A JSON-pointer-ish path: `""` is the root, children append `/<key>`. */
type Path = string;

export interface Line {
	path: Path;
	text: string;
	/** Object/array with at least one child — the only lines that fold. */
	foldable: boolean;
	expanded: boolean;
	/** Number of leading indent levels, so the TTY layer can jump to a parent. */
	level: number;
}

export interface RenderOptions {
	/** Paths currently expanded. */
	expanded: ReadonlySet<Path>;
}

type Container = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is Container {
	return typeof value === "object" && value !== null;
}

function childrenOf(value: Container): [string, unknown][] {
	return Array.isArray(value) ? value.map((v, i): [string, unknown] => [String(i), v]) : Object.entries(value);
}

function scalar(value: unknown): string {
	if (typeof value === "string") return chalk.green(JSON.stringify(value));
	if (typeof value === "number") return chalk.yellow(String(value));
	if (typeof value === "boolean") return chalk.magenta(String(value));
	return chalk.dim(String(value === undefined ? null : value));
}

function summary(value: Container): string {
	const n = childrenOf(value).length;
	const unit = Array.isArray(value) ? (n === 1 ? "item" : "items") : n === 1 ? "key" : "keys";
	return chalk.dim(Array.isArray(value) ? `[… ${n} ${unit}]` : `{… ${n} ${unit}}`);
}

/**
 * Paths of every container deeper than `depth` levels are left out, so those
 * render collapsed. `depth: 0` collapses the root; `Infinity` expands all.
 */
export function expandToDepth(value: unknown, depth: number): Set<Path> {
	const out = new Set<Path>();
	const walk = (v: unknown, path: Path, level: number): void => {
		if (!isContainer(v) || level >= depth) return;
		out.add(path);
		for (const [k, child] of childrenOf(v)) walk(child, `${path}/${k}`, level + 1);
	};
	walk(value, "", 0);
	return out;
}

/** Flatten `value` into the lines visible under `expanded`. Pure — no I/O. */
export function renderTree(value: unknown, { expanded }: RenderOptions): Line[] {
	const lines: Line[] = [];
	const walk = (v: unknown, path: Path, level: number, label: string, trailing: string): void => {
		const indent = "  ".repeat(level);
		const prefix = `${indent}${label}`;
		if (!isContainer(v)) {
			lines.push({ path, text: `${prefix}${scalar(v)}${trailing}`, foldable: false, expanded: false, level });
			return;
		}
		const kids = childrenOf(v);
		const [open, close] = Array.isArray(v) ? ["[", "]"] : ["{", "}"];
		if (kids.length === 0) {
			lines.push({ path, text: `${prefix}${open}${close}${trailing}`, foldable: false, expanded: false, level });
			return;
		}
		if (!expanded.has(path)) {
			lines.push({ path, text: `${prefix}${summary(v)}${trailing}`, foldable: true, expanded: false, level });
			return;
		}
		lines.push({ path, text: `${prefix}${open}`, foldable: true, expanded: true, level });
		kids.forEach(([k, child], i) => {
			const comma = i < kids.length - 1 ? "," : "";
			const childLabel = Array.isArray(v) ? "" : `${chalk.cyan(JSON.stringify(k))}: `;
			walk(child, `${path}/${k}`, level + 1, childLabel, comma);
		});
		lines.push({
			path: `${path}#close`,
			text: `${indent}${close}${trailing}`,
			foldable: false,
			expanded: false,
			level,
		});
	};
	walk(value, "", 0, "", "");
	return lines;
}

export interface ViewJsonOptions {
	/** Collapse containers deeper than this many levels (static mode and the interactive start state). */
	depth?: number;
	/**
	 * `true` forces the folding viewer (throws without a TTY), `false` forces
	 * static output. Left unset it auto-enables when stdin and stdout are both
	 * TTYs and no `depth` was asked for (an explicit depth means static output).
	 */
	interactive?: boolean;
}

export interface ViewState {
	cursor: number;
	top: number;
	expanded: Set<Path>;
}

export type Key = "up" | "down" | "left" | "right" | "expandAll" | "collapseAll" | "quit";

/** Pure key reducer: `(state, key) -> state`. `rows` is the viewport height. */
export function reduceKey(state: ViewState, key: Key, value: unknown, rows: number): ViewState {
	const lines = renderTree(value, { expanded: state.expanded });
	const cur = lines[state.cursor];
	let { cursor } = state;
	const expanded = new Set(state.expanded);
	switch (key) {
		case "up":
			cursor = Math.max(0, cursor - 1);
			break;
		case "down":
			cursor = Math.min(lines.length - 1, cursor + 1);
			break;
		case "right":
			if (cur?.foldable) expanded.add(cur.path);
			break;
		case "left":
			if (cur?.foldable && cur.expanded) expanded.delete(cur.path);
			else if (cur) {
				const parent = lines.findLastIndex(
					(l, i) => i < cursor && l.foldable && l.expanded && l.level < cur.level
				);
				if (parent >= 0) cursor = parent;
			}
			break;
		case "expandAll":
			return { cursor, top: state.top, expanded: expandToDepth(value, Infinity) };
		case "collapseAll":
			return { cursor: 0, top: 0, expanded: new Set() };
		case "quit":
			break;
	}
	const count = renderTree(value, { expanded }).length;
	cursor = Math.min(cursor, count - 1);
	let top = state.top;
	if (cursor < top) top = cursor;
	if (cursor >= top + rows) top = cursor - rows + 1;
	return { cursor, top: Math.max(0, top), expanded };
}

const KEYMAP: Record<string, Key> = {
	"\u001b[A": "up",
	k: "up",
	"\u001b[B": "down",
	j: "down",
	"\u001b[C": "right",
	l: "right",
	"\r": "right",
	" ": "right",
	"\u001b[D": "left",
	h: "left",
	E: "expandAll",
	C: "collapseAll",
	q: "quit",
	"\u001b": "quit",
	"\u0003": "quit",
};

function draw(out: NodeJS.WriteStream, value: unknown, state: ViewState, rows: number): void {
	const lines = renderTree(value, { expanded: state.expanded });
	const view = lines.slice(state.top, state.top + rows).map((l, i) => {
		const marker = l.foldable ? (l.expanded ? "▾ " : "▸ ") : "  ";
		const row = `${marker}${l.text}`;
		return state.top + i === state.cursor ? chalk.inverse(row) : row;
	});
	const footer = chalk.dim(`${state.cursor + 1}/${lines.length}  ↑↓ move  →/⏎ expand  ← collapse  E/C all  q quit`);
	out.write(`\u001b[H\u001b[J${view.join("\n")}\n${footer}`);
}

async function runInteractive(value: unknown, depth: number): Promise<void> {
	const { stdin, stdout } = process;
	if (!stdin.isTTY || !stdout.isTTY) {
		throw new NonInteractiveError("--interactive needs a TTY on stdin and stdout.");
	}
	const rows = (): number => Math.max(3, (stdout.rows ?? 24) - 1);
	let state: ViewState = { cursor: 0, top: 0, expanded: expandToDepth(value, depth) };
	const wasRaw = stdin.isRaw;
	stdin.setRawMode(true);
	stdin.resume();
	stdout.write("\u001b[?1049h\u001b[?25l");
	const redraw = (): void => draw(stdout, value, state, rows());
	stdout.on("resize", redraw);
	try {
		redraw();
		await new Promise<void>((resolve) => {
			const onData = (buf: Buffer): void => {
				const key = KEYMAP[buf.toString()];
				if (key === "quit") {
					stdin.off("data", onData);
					resolve();
					return;
				}
				if (key) {
					state = reduceKey(state, key, value, rows());
					redraw();
				}
			};
			stdin.on("data", onData);
		});
	} finally {
		stdout.off("resize", redraw);
		stdout.write("\u001b[?25h\u001b[?1049l");
		stdin.setRawMode(wasRaw);
		stdin.pause();
	}
}

/**
 * Print `value` as JSON. Non-TTY stdout always gets plain, valid
 * `JSON.stringify` output (so `| jq` and redirects keep working); a TTY gets a
 * coloured tree, collapsed past `depth`. `interactive` opens a folding viewer (the default on a TTY).
 */
export async function viewJson(value: unknown, options: ViewJsonOptions = {}): Promise<void> {
	const depth = options.depth ?? Infinity;
	const interactive =
		options.interactive ?? (options.depth === undefined && Boolean(process.stdin.isTTY && process.stdout.isTTY));
	if (interactive) return runInteractive(value, options.depth ?? 1);
	if (!process.stdout.isTTY) {
		console.log(JSON.stringify(value, null, 2));
		return;
	}
	const lines = renderTree(value, { expanded: expandToDepth(value, depth) });
	console.log(lines.map((l) => l.text).join("\n"));
}
