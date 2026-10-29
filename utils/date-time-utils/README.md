# `@theholocron/date-time-utils`

Date and time utilities.

## Installation

```bash
pnpm add @theholocron/date-time-utils
```

## Usage

```typescript
import { getTimeOfDay } from "@theholocron/date-time-utils";

getTimeOfDay(); // uses current time
getTimeOfDay(new Date("2024-01-01 08:00")); // "morning"
getTimeOfDay(new Date("2024-01-01 14:00")); // "afternoon"
getTimeOfDay(new Date("2024-01-01 20:00")); // "evening"
```

### `getTimeOfDay(date?)`

Returns `"morning"` (midnight–10:59), `"afternoon"` (11:00–17:59), or `"evening"` (18:00+). Defaults to the current time when no date is passed.

## Documentation

Check out [The Holocron Archive](https://docs.theholocron.dev/projects/utils/) for more information.
