import { getCurrentLocation } from "./location.ts";

export type { IGeolocationCoordinates, LocationLogger } from "./location.ts";

export const location = {
	getCurrent: getCurrentLocation,
};
