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

## Uploading

Documented at https://developer.productive.io/working_with_attachments.html as four steps. This
server runs three of them per file, in `upload_attachment`:

1. `POST /attachments` with `name`, `content_type`, `size` and `attachable_type`, plus the
   parent relationship (`task` or `comment`). The response carries `aws_policy`: `key`,
   `policy`, `success_action_status`, `Content-Type` and the `x-amz-*` signing fields.
2. `POST https://productive-files-production.s3.eu-west-1.amazonaws.com` as multipart form
   data: every `aws_policy` field verbatim, then the file in a field named `File`. The file must
   come last because S3 ignores fields after it. No Productive headers go on this request; the
   signed policy authorises it. S3 answers 201 with XML whose `<Location>` is the stored object.
3. `PATCH /attachments/{id}` setting `temp_url` to that `<Location>` (URL-encoded as S3 returns
   it).

The docs' fourth step PATCHes the parent's `attachments` relationship. Setting the parent
relationship in step 1 links the attachment on its own (confirmed against the live API), and it
avoids rewriting the parent's attachment list, which under JSON:API semantics could replace it.

Findings from the live API:

- The record has a `url` straight after step 1, before any bytes exist. A record with a URL is
  not proof of an upload. The only proof is downloading the file and comparing a hash;
  `scripts/verify-upload.mjs` does exactly that.
- The decoded `policy` carries `["content-length-range", 0, 104857600]`: 100 MB is the limit.
  The tool rejects larger files before creating anything, and checks each policy's own range
  again in case it changes.
- The policy expires about an hour after the create call.
- If any step fails, the tool deletes every record it created in that call
  (`DELETE /attachments/{id}`).

## Deleting

`DELETE /attachments/{id}` removes the attachment and detaches it from its parent; a later
`GET` returns 404. `delete_attachment` sits behind the standard `confirm` gate. Its preview
fetches `attachments/{id}?include=task,comment` so it can name the parent task or comment,
which is what catches a wrong ID.

## Security rule

Token-in-URL is the official method, but the tokenised URL must never reach the model or the logs. Discovery tools return only the bare `url`. The download tool builds the tokenised URL internally, fetches server-side, and returns only a local file path or an inline image. Redact `?token=` from error logs; `client.ts` `makeRequest` logs the URL in its catch block, so keep that redaction in place.

## Test fixtures

Attachment handling is easiest to verify against three throwaway tasks in your own organisation, one each with an image, a PDF and a spreadsheet attached. Keep their task and attachment ids out of this repository: it is public, so record them in a local untracked note instead.
