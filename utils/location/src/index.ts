import { getCurrentLocation } from "./location";

export type { IGeolocationCoordinates } from "./location";

export const location = {
	getCurrent: getCurrentLocation,
};
