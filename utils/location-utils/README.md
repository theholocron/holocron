# `@theholocron/location-utils`

Browser geolocation utilities.

## Installation

```bash
pnpm add @theholocron/location-utils
```

## Usage

```typescript
import { location } from "@theholocron/location-utils";

const coords = await location.getCurrent();
// {
//   latitude: 37.7749,
//   longitude: -122.4194,
//   accuracy: 10,
//   altitude: null,
//   altitudeAccuracy: null,
//   heading: null,
//   speed: null,
// }
```

### `location.getCurrent()`

Requests the device's current position via the [Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API). Returns a `Promise<IGeolocationCoordinates>`.

- If geolocation permission is denied, returns fallback coordinates `{ latitude: 0, longitude: 0, accuracy: 0 }` with a console warning.
- Uses `enableHighAccuracy: true` and a 27-second timeout.

> **Note:** Requires a browser environment — does not work in Node.js.

## Documentation

Check out [The Holocron Archive](https://docs.theholocron.dev/projects/utils/) for more information.
