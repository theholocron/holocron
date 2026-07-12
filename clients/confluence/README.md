# Confluence Client

A NodeJS/JavaScript client for interacting with Confluence.

## Installation

```bash
npm install --save @theholocron/client-confluence
```

## Usage

```javascript
import work from "@theholocron/client-confluence";

const [err, auth] = work.login("user", "pass");
const [err, review] = work.review.appraisal.get("loan-guid", { token: auth.token });
const [err, data] = work.review.appraisal.update(review.reportReviews.nodes[0].id, "completed", { token: auth.token });
```
