#!/usr/bin/env node
/**
 * Validates frontmatter in ADR and spec files.
 *
 * ADRs: docs/architecture/adr/*.md (excluding template.md)
 * Specs: .notes/*.spec.md
 *
 * Usage:
 *   node scripts/validate-adrs.mjs           # validate all files
 *   node scripts/validate-adrs.mjs file1 ... # validate specific files
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const ADR_DIR = resolve(root, "docs/architecture/adr");
const NOTES_DIR = resolve(root, ".notes");

const ADR_STATUSES = new Set(["proposed", "accepted", "rejected", "deprecated", "superseded"]);
const SPEC_STATUSES = new Set(["draft", "proposed", "accepted", "archived", "superseded"]);

/** Extract YAML frontmatter from a markdown file. Returns null if none found. */
function parseFrontmatter(content) {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return null;
	const fm = {};
	for (const line of match[1].split("\n")) {
		const kv = line.match(/^(\w[\w-]*):\s*(.*)/);
		if (kv) fm[kv[1]] = kv[2].trim();
	}
	return fm;
}

function isValidIsoDate(s) {
	return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

let errors = 0;
let warnings = 0;

function error(file, msg) {
	console.error(`  ERROR  ${file}: ${msg}`);
	errors++;
}

function warn(file, msg) {
	console.warn(`  WARN   ${file}: ${msg}`);
	warnings++;
}

function validateAdr(filepath) {
	const name = basename(filepath);
	if (name === "template.md" || name === "README.md") return;
	if (extname(filepath) !== ".md") return;

	const content = readFileSync(filepath, "utf8");
	const fm = parseFrontmatter(content);

	if (!fm) {
		error(name, "no frontmatter found");
		return;
	}

	// id must be present
	if (!fm.id) {
		error(name, "missing `id` field");
	} else {
		// id must match filename sequence: 0001-slug.md → ADR-0001
		const seqMatch = name.match(/^(\d{4})-/);
		if (seqMatch && fm.id !== `ADR-${seqMatch[1]}`) {
			error(name, `id "${fm.id}" does not match filename sequence (expected ADR-${seqMatch[1]})`);
		}
	}

	// title must be non-empty
	if (!fm.title || fm.title === '""' || fm.title === "''") {
		error(name, "missing or empty `title` field");
	}

	// status must be valid
	if (!fm.status) {
		error(name, "missing `status` field");
	} else if (!ADR_STATUSES.has(fm.status)) {
		error(name, `invalid status "${fm.status}" — must be one of: ${[...ADR_STATUSES].join(", ")}`);
	}

	// date must be a valid ISO date
	if (!fm.date) {
		error(name, "missing `date` field");
	} else if (!isValidIsoDate(fm.date)) {
		error(name, `invalid date "${fm.date}" — must be YYYY-MM-DD`);
	}

	// accepted ADRs should have a discussion link
	if (fm.status === "accepted" && (!fm.discussion || fm.discussion === "")) {
		warn(name, "status is accepted but `discussion.github` is not set");
	}
}

function validateSpec(filepath) {
	const name = basename(filepath);
	if (!name.endsWith(".spec.md")) return;

	const content = readFileSync(filepath, "utf8");
	const fm = parseFrontmatter(content);

	if (!fm) {
		error(name, "no frontmatter found");
		return;
	}

	// status must be valid
	if (!fm.status) {
		error(name, "missing `status` field");
	} else if (!SPEC_STATUSES.has(fm.status)) {
		error(name, `invalid status "${fm.status}" — must be one of: ${[...SPEC_STATUSES].join(", ")}`);
	}

	// issue field must be populated (process rule)
	if (!fm.issue) {
		warn(name, "missing `issue` field — every spec must have a companion GitHub issue");
	}
}

// Determine which files to validate
const args = process.argv.slice(2).map((f) => resolve(f));

const adrFiles =
	args.length > 0
		? args.filter((f) => f.includes("/adr/"))
		: existsSync(ADR_DIR)
			? readdirSync(ADR_DIR).map((f) => resolve(ADR_DIR, f))
			: [];

const specFiles =
	args.length > 0
		? args.filter((f) => f.includes(".notes/") && f.endsWith(".spec.md"))
		: existsSync(NOTES_DIR)
			? readdirSync(NOTES_DIR)
					.filter((f) => f.endsWith(".spec.md"))
					.map((f) => resolve(NOTES_DIR, f))
			: [];

if (adrFiles.length > 0) {
	console.log(`\nValidating ${adrFiles.length} ADR file(s)…`);
	for (const f of adrFiles) validateAdr(f);
}

if (specFiles.length > 0) {
	console.log(`\nValidating ${specFiles.length} spec file(s)…`);
	for (const f of specFiles) validateSpec(f);
}

console.log(`\n${errors} error(s), ${warnings} warning(s)`);

if (errors > 0) process.exit(1);
