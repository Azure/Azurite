---
name: code-review
description: Review Azurite pull requests with service-aware checks for Blob, Queue, and Table behavior, API compatibility, tests, and release notes.
---

Use this skill when reviewing pull requests in this repository.

## Review focus

1. Confirm changes preserve Azure Storage API compatibility for the affected service (`src/blob`, `src/queue`, `src/table`, or shared middleware/utilities).
2. Check authentication, authorization, and request validation paths for regressions (SharedKey/SAS/OAuth and public access behavior where applicable).
3. For persistence-related changes, verify behavior for default Loki metadata and SQL-backed metadata paths.
4. If generated protocol/model code is changed, verify that related handler logic and tests remain aligned.

## Evidence to collect in review

1. Require tests for changed behavior under the relevant area in `tests/**` (service-specific tests when possible).
2. Prefer targeted validation commands based on changed surface area:
   - `npm run lint`
   - `npm run build`
   - `npm run test:blob`, `npm run test:queue`, `npm run test:table`, or `npm test`
3. Check whether `ChangeLog.md` needs an `## Upcoming Release` update for user-visible changes.

## Tailored risk checks

1. Cross-service shared changes (`src/common`, middleware, auth, persistence abstractions) should be reviewed for Blob/Queue/Table impact, not only the touched service.
2. API version or protocol behavior changes should verify request/response status codes, headers, and error shapes.
3. Storage semantics changes should check edge cases such as conditional headers, lease/concurrency behavior, and metadata/property handling.

## Review outcome

Provide a concise summary with:

- Confirmed behavior
- Residual risks
- Missing tests or validation
- Follow-up actions required before merge
