import { getCurrentLocation } from "./location.ts";

export type { IGeolocationCoordinates, LocationLogger } from "./location.ts";

/**
 * Geolocation helpers. Browser-only: they use `navigator.geolocation` and `navigator.permissions`, so they do not
 * work in Node.js.
 *
 * @example
 * ```ts
 * import { location } from "@theholocron/location-utils";
 *
 * const coords = await location.getCurrent();
 * console.log(coords.latitude, coords.longitude);
 * ```
 */
export const location = {
	/** Resolves the current position, or a zeroed fallback when permission is denied or the lookup fails. */
	getCurrent: getCurrentLocation,
};
