import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createEnvLookup, isCI } from "@theholocron/env-utils/lookup";
import chalk from "chalk";

import type { CacheEntry, UpdateCheckOptions } from "./update-notifier.type.js";

const CACHE_FILE = "update-check.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;

function readCache(cacheDir: string): CacheEntry | null {
	try {
		return JSON.parse(readFileSync(join(cacheDir, CACHE_FILE), "utf8")) as CacheEntry;
	} catch {
		return null;
	}
}

function writeCache(cacheDir: string, entry: CacheEntry): void {
	try {
		mkdirSync(cacheDir, { recursive: true });
		writeFileSync(join(cacheDir, CACHE_FILE), JSON.stringify(entry));
	} catch {
		// silently ignore — update check is best-effort
	}
}

async function fetchLatestVersion(name: string, channel: string): Promise<string | null> {
	try {
		const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { "dist-tags": Record<string, string> };
		return data["dist-tags"][channel] ?? data["dist-tags"]["latest"] ?? null;
	} catch {
		return null;
	}
}

function getChannel(version: string): string {
	const match = /^[^-]+-([a-zA-Z]+)/.exec(version);
	return match?.[1] ?? "latest";
}

/**
 * Whether `latest` is newer than `current`: release parts compare as numbers, a stable release is newer than any
 * prerelease of it, and prereleases compare segment by segment. A leading `v` is ignored.
 */
export function isUpdateAvailable(current: string, latest: string): boolean {
	const normalize = (v: string) => v.replace(/^v/, "");
	const c = normalize(current);
	const l = normalize(latest);
	if (c === l) return false;

	const splitPre = (v: string): [string, string] => {
		const idx = v.indexOf("-");
		return idx === -1 ? [v, ""] : [v.slice(0, idx), v.slice(idx + 1)];
	};

	const [cRelease, cPre] = splitPre(c);
	const [lRelease, lPre] = splitPre(l);

	const parseRelease = (r: string) => r.split(".").map(Number);
	const cParts = parseRelease(cRelease);
	const lParts = parseRelease(lRelease);

	for (let i = 0; i < Math.max(cParts.length, lParts.length); i++) {
		const cv = cParts[i] ?? 0;
		const lv = lParts[i] ?? 0;
		if (lv > cv) return true;
		if (lv < cv) return false;
	}

	// Release parts equal — compare prerelease
	if (!lPre && cPre) return true; // stable > prerelease
	if (lPre && !cPre) return false; // prerelease < stable

	// Both prerelease — compare segment by segment
	const cPreParts = cPre.split(".");
	const lPreParts = lPre.split(".");
	for (let i = 0; i < Math.max(cPreParts.length, lPreParts.length); i++) {
		const cv = cPreParts[i] ?? "";
		const lv = lPreParts[i] ?? "";
		const cvNum = Number(cv);
		const lvNum = Number(lv);
		if (!isNaN(cvNum) && !isNaN(lvNum)) {
			if (lvNum > cvNum) return true;
			if (lvNum < cvNum) return false;
		} else {
			if (lv > cv) return true;
			if (lv < cv) return false;
		}
	}

	return false;
}

function formatNotice(current: string, latest: string, installCmd: string): string {
	// Measure raw strings before applying chalk so we avoid control-char regexes.
	const raw1 = `Update available: ${current} → ${latest}`;
	const raw2 = `Run ${installCmd} to update`;
	const width = Math.max(raw1.length, raw2.length) + 4;
	const bar = chalk.yellow("─".repeat(width));
	const border = chalk.yellow("│");
	const pad = (raw: string, styled: string) => `${border} ${styled}${" ".repeat(width - 2 - raw.length)} ${border}`;
	return [
		"",
		chalk.yellow(`╭${bar}╮`),
		pad(raw1, `Update available: ${chalk.dim(current)} → ${chalk.green(latest)}`),
		pad(raw2, `Run ${chalk.cyan(installCmd)} to update`),
		chalk.yellow(`╰${bar}╯`),
		"",
	].join("\n");
}

/**
 * Looks for a newer version of a package on npm, at most once a day, and returns a function that prints a boxed notice to
 * stderr, or `null` when there is nothing to say. It is best-effort: a network error, a bad answer or an unwritable cache
 * is `null`, never a thrown error. It says nothing in CI or when `NO_UPDATE_NOTIFIER` is set. A prerelease is compared
 * with the newest version on its own channel (`2.0.0-alpha.3` with the `alpha` tag).
 */
export async function checkForUpdates(options: UpdateCheckOptions): Promise<(() => void) | null> {
	const { name, currentVersion, cacheDir } = options;
	if (isCI(options.env) || createEnvLookup(options.env).get("NO_UPDATE_NOTIFIER")) return null;

	const channel = getChannel(currentVersion);
	const cache = readCache(cacheDir);
	const now = Date.now();

	let latestVersion: string | null = null;

	if (cache && now - cache.checkedAt < CACHE_TTL_MS) {
		latestVersion = cache.latestVersion;
	} else {
		latestVersion = await fetchLatestVersion(name, channel);
		if (latestVersion) writeCache(cacheDir, { latestVersion, checkedAt: now });
	}

	if (!latestVersion || !isUpdateAvailable(currentVersion, latestVersion)) return null;

	const installCommand = options.installCommand ?? `npm install -g ${name}`;
	return () => {
		process.stderr.write(formatNotice(currentVersion, latestVersion as string, installCommand) + "\n");
	};
}
