import type { ProbeRow } from "../../plugin/index.js";
import type { TokenRotation } from "../auth/index.js";
import type { TokenLifetime } from "./token-rotation.type.js";

/** The rotation policy of a token that declares none: a token is due after 90 days, and an expiry is flagged 14 days ahead. */
export const DEFAULT_TOKEN_ROTATION: Required<TokenRotation> = { maxAgeDays: 90, warnDays: 14 };

const DAY_MS = 86_400_000;

/** The whole days from `from` to `to`, rounded down (negative once `to` is past). */
function daysBetween(from: Date, to: Date): number {
	return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/** `2026-11-13` of a valid date. */
const day = (d: Date): string => d.toISOString().slice(0, 10);

/** A valid `Date` of an ISO string, or `undefined` when there is none or it does not parse. */
function parse(value: string | undefined): Date | undefined {
	if (value === undefined) return undefined;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Rows saying whether a token is due for rotation, from what its provider exposes. Provider-neutral: a token probe reads
 * the lifetime however its provider offers it and hands it here, with the layer's `rotation` from `tokenExpectations()`.
 * `lifetime` is `undefined` when the provider exposes nothing (the row says so rather than passing), and a date the
 * provider gave that does not parse is an `info` row, never a pass. An expired or near-expiry token fails, and so does
 * one older than `maxAgeDays`. Only dates are printed, never the token.
 */
export function tokenRotationRows(
	lifetime: TokenLifetime | undefined,
	rotation: Required<TokenRotation>,
	now: Date
): ProbeRow[] {
	if (!lifetime) {
		return [
			{
				status: "info",
				label: "rotation",
				detail: `the provider does not expose this token's age or expiry; rotate it by hand every ${rotation.maxAgeDays} days`,
			},
		];
	}
	const rows: ProbeRow[] = [];
	const expires = parse(lifetime.expiresAt);
	if (lifetime.expiresAt !== undefined && !expires) {
		rows.push({ status: "info", label: "expiry", detail: "the provider's expiry date could not be read" });
	} else if (expires) {
		const left = daysBetween(now, expires);
		if (expires.getTime() <= now.getTime()) {
			rows.push({ status: "fail", label: "expiry", detail: `expired on ${day(expires)}` });
		} else if (left < rotation.warnDays) {
			rows.push({
				status: "fail",
				label: "expiry",
				detail: `expires on ${day(expires)} (${left} days left, warns under ${rotation.warnDays}); rotate it`,
			});
		} else {
			rows.push({ status: "ok", label: "expiry", detail: `expires on ${day(expires)} (${left} days left)` });
		}
	} else {
		rows.push({ status: "info", label: "expiry", detail: "the token has no expiry" });
	}
	const created = parse(lifetime.createdAt);
	if (lifetime.createdAt !== undefined && !created) {
		rows.push({ status: "info", label: "age", detail: "the provider's creation date could not be read" });
	} else if (created) {
		const age = daysBetween(created, now);
		const due = age > rotation.maxAgeDays;
		rows.push({
			status: due ? "fail" : "ok",
			label: "age",
			detail: due
				? `${age} days old since ${day(created)}, over the ${rotation.maxAgeDays} days allowed; rotate it`
				: `${age} days old since ${day(created)} (rotate after ${rotation.maxAgeDays})`,
		});
	} else {
		rows.push({ status: "info", label: "age", detail: "the provider does not say when the token was made" });
	}
	return rows;
}
