import { getCurrentLocation } from "./location.ts";

export type { IGeolocationCoordinates } from "./location.ts";

export const location = {
	getCurrent: getCurrentLocation,
};
