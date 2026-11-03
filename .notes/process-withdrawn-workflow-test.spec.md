---
status: proposed
issue: theholocron/holocron#1653
blocked-by: []
related: []
---

# Throwaway: test the withdrawn workflow

This file exists only to test the `withdrawn` state (#1653). **Do not merge the pull request that adds it.**

## Problem

A spec or ADR is posted to the forum while its pull request is still open, so a pull request that is closed without
merging leaves a post that says "in discussion" for good. The `withdrawn` state tags that post and closes it.

## How to test it

1. Open this pull request. The `Spec discussions (pull request)` workflow makes a forum post in `#ideas`, tagged
   💬 `proposed`.
2. Close the pull request without merging. The post should be tagged 🔕 `withdrawn` and closed.
3. Reopen it. The post should go back to 💬 `proposed` and open again.
4. Close it again and delete the branch. The post stays 🔕 `withdrawn`; a gatekeeper can delete the post.

## Decision

None. This is a test.
