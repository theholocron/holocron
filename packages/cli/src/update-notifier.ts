import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import chalk from "chalk";

const PACKAGE_NAME = "@theholocron/cli";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;

interface CacheEntry {
	latestVersion: string;
	checkedAt: number;
}

function getCacheDir(): string {
	return process.env["HOLOCRON_CACHE_DIR"] ?? join(homedir(), ".cache", "holocron");
}

function getCachePath(): string {
	return join(getCacheDir(), "update-check.json");
}

function readCache(): CacheEntry | null {
	try {
		return JSON.parse(readFileSync(getCachePath(), "utf8")) as CacheEntry;
	} catch {
		return null;
	}
}

function writeCache(entry: CacheEntry): void {
	try {
		mkdirSync(getCacheDir(), { recursive: true });
		writeFileSync(getCachePath(), JSON.stringify(entry));
	} catch {
		// silently ignore — update check is best-effort
	}
}

async function fetchLatestVersion(channel: string): Promise<string | null> {
	try {
		const res = await fetch(
			`https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}`,
			{ signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
		);
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
	if (!lPre && cPre) return true;  // stable > prerelease
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

function formatNotice(current: string, latest: string): string {
	const installCmd = `npm install -g ${PACKAGE_NAME}`;
	const line1 = `Update available: ${chalk.dim(current)} → ${chalk.green(latest)}`;
	const line2 = `Run ${chalk.cyan(installCmd)} to update`;
	const width = Math.max(line1.replace(/\x1b\[[0-9;]*m/g, "").length, line2.replace(/\x1b\[[0-9;]*m/g, "").length) + 4;
	const bar = chalk.yellow("─".repeat(width));
	const pad = (s: string, raw: string) => {
		const padded = raw.padEnd(width - 2);
		return `${chalk.yellow("│")} ${s}${" ".repeat(padded.length - raw.length)} ${chalk.yellow("│")}`;
	};
	return [
		"",
		chalk.yellow(`╭${bar}╮`),
		pad(line1, line1.replace(/\x1b\[[0-9;]*m/g, "")),
		pad(line2, line2.replace(/\x1b\[[0-9;]*m/g, "")),
		chalk.yellow(`╰${bar}╯`),
		"",
	].join("\n");
}

export async function checkForUpdates(currentVersion: string): Promise<(() => void) | null> {
	if (process.env["CI"] || process.env["NO_UPDATE_NOTIFIER"]) return null;

	const channel = getChannel(currentVersion);
	const cache = readCache();
	const now = Date.now();

	let latestVersion: string | null = null;

	if (cache && now - cache.checkedAt < CACHE_TTL_MS) {
		latestVersion = cache.latestVersion;
	} else {
		latestVersion = await fetchLatestVersion(channel);
		if (latestVersion) writeCache({ latestVersion, checkedAt: now });
	}

	if (!latestVersion || !isUpdateAvailable(currentVersion, latestVersion)) return null;

	return () => {
		process.stderr.write(formatNotice(currentVersion, latestVersion as string) + "\n");
	};
}
