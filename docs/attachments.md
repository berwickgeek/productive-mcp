# Attachments

How Productive attachments work and the rule this server follows for downloading them. Tracked originally in issue #26.

## Resource fields (confirmed against the live API)

`name`, `content_type`, `size` (integer bytes), `url`, `temp_url`, `thumb`, `attachable_type` (`"task"`, `"comment"`, `"invoice"`, and others), `created_at`, `deleted_at`, `attachment_type`, `message_id`, `external_id`, `resized`. Not `file_content_type` or `file_size`.

## Fetching

`GET /tasks?include=attachments` and `GET /comments?include=attachments` both work; attachment resources land in `included`. The relationship is polymorphic: `attachable_type` says which parent.

## Downloading (the official method)

Per the Productive docs (https://developer.productive.io/working_with_attachments.html), append the API token as a query parameter to `url`: `{url}&token={PRODUCTIVE_API_TOKEN}`. That returns 200 with the correct content type and bytes.

- `url` fetched bare: 302 to the web login. `files.productive.io` does not honour the `X-Auth-Token` header.
- `temp_url` is an internal storage path, not a presigned S3 URL: 403. Do not use it.
- There is no header-based download alternative.

## Security rule

Token-in-URL is the official method, but the tokenised URL must never reach the model or the logs. Discovery tools return only the bare `url`. The download tool builds the tokenised URL internally, fetches server-side, and returns only a local file path or an inline image. Redact `?token=` from error logs; `client.ts` `makeRequest` logs the URL in its catch block, so keep that redaction in place.

## Test fixtures

Attachment handling is easiest to verify against three throwaway tasks in your own organisation, one each with an image, a PDF and a spreadsheet attached. Keep their task and attachment ids out of this repository: it is public, so record them in a local untracked note instead.
