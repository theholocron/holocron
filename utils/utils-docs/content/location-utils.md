---
title: Location Utils
description: Browser geolocation wrapper.
---

`@theholocron/location-utils` wraps the browser Geolocation API with a Promise-based interface and graceful permission handling.

## Install

```bash
npm i @theholocron/location-utils
```

## API

### `location.getCurrent()`

Returns a `Promise<IGeolocationCoordinates>`. Falls back to zeroed coordinates if the user has denied the permission.

```ts
import { location } from "@theholocron/location-utils";

const coords = await location.getCurrent();
console.log(coords.latitude, coords.longitude);
```

### Types

```ts
interface IGeolocationCoordinates {
  accuracy: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  latitude: number;
  longitude: number;
  speed?: number | null;
}
```

## Notes

This package uses browser-only APIs (`navigator.geolocation`, `navigator.permissions`). It will not work in Node.js environments.
