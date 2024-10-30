# Array

Convert or manipulate arrays.

## Installation

```bash
npm install --save-dev @theholocron/utils-array
```

## Usage

```typescript
import * as arr from "@theholocron/utils-array";

const data = [
	null,
	undefined,
	"foo",
];

const filtered = data.filter(arr.isValid); // ["foo"]
```
