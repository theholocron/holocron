import { getCurrentLocation } from "./location.ts";

export type { IGeolocationCoordinates, LocationLogger } from "./location.ts";

/** Geolocation helpers. */
export const location = {
	/** Resolves the current position, or a zeroed fallback when permission is denied or the lookup fails. */
	getCurrent: getCurrentLocation,
};
