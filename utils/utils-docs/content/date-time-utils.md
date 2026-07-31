---
title: Date & Time Utils
description: Date and time helpers.
---

`@theholocron/date-time-utils` provides helpers for working with dates and time of day.

## Install

```bash
npm i @theholocron/date-time-utils
```

## API

### `getTimeOfDay(date?)`

Returns a `TTimeOfDay` string representing the part of the day for the given date (or now if omitted).

| Hours | Return value  |
| ----- | ------------- |
| 0–10  | `"morning"`   |
| 11–17 | `"afternoon"` |
| 18–23 | `"evening"`   |

```ts
import { getTimeOfDay } from "@theholocron/date-time-utils";

getTimeOfDay(); // e.g. "morning"
getTimeOfDay(new Date("2024-01-01T20:00:00")); // "evening"
```

### Types

```ts
type TTimeOfDay = "morning" | "afternoon" | "evening";
```
