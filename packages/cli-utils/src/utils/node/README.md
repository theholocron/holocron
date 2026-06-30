# Node

Interact with node packages.

## Usage

```javascript
import { node } from "@/utils";

const name = node.pkg("~/code/foo");
```

## API

### `.pkg(dirPath: string)`

Grabs the data from the package in parsed JSON.

#### dirPath

The pathway to the `package.json`.

Type: `string`
