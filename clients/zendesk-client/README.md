# Zendesk Client

A NodeJS/JavaScript client for our Zendesk API.

## Installation

```bash
npm install --save @theholocron/client-zendesk
```

## Usage

```javascript
import zendesk from "@theholocron/client-zendesk";

const [ticketsErr, tickets] = zendesk.tickets.get("loan-guid", { token: auth.token });
```

_Check the `examples.ts` file for more._
