# Configuration

A wrapper around [`conf`](https://github.com/sindresorhus/conf) that provides a configuration file for storing environment variables.

The configuration will pull from a `config.json` file within the operating systems [preferred configuration locations](https://github.com/sindresorhus/env-paths?tab=readme-ov-file#pathsdata).

## Usage

```javascript
import { config } from "@/utils";

const debugMode = "preferences.debug";

// get an item
const isDebugMode = config.get(debugMode);

// set an item
config.write(debugMode, true);
```
## API

The API is a wrapper, so look at the [docs](https://github.com/sindresorhus/conf) for a detailed list of functions.  The following is the ones that are most commonly used.

### `.get(key, defaultValue?)`

Get an item or `defaultValue` if the item does not exist.

### `.set(key, value)`

Set an item.

The value must be JSON serializable. Trying to set the type `undefined`, `function`, or `symbol` will result in a `TypeError`.

### `.set(object)`

Set multiple items at once.

### `.edit()`

Open the configuration file in your preferred `$EDITOR`;

