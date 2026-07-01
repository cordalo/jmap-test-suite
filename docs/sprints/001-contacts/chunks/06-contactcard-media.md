# Sprint 001 · Chunk 06 — ContactCard photo / media blob path

> References: `decision.md` (AC 1, 5; media in v1), `definition-of-done.md`
> (blob integration point, non-image rejection). RFC 9610 §ContactCard media /
> blobId; RFC 9553 §media (Media object). Not restated.

## Scope

The JSContact `media` (photo/logo/sound) path as JMAP surfaces it: on write a
Media entry references an uploaded blob; on read the server returns it as a
`blobId` (RFC 9610 replaces `data:` URIs with `blobId` in responses). New file
under `src/tests/contacts/`, category `contacts`, capability-gated. Builds on the
chunk-5 write path and the existing blob upload/download helpers
(`JmapClient.upload` / `download`).

## Approach

New file:
- `contactcard-media.test.ts`

Uses `ctx`'s upload helper. The test uploads **its own** bytes — a small valid
image and a small non-image — rather than depending on mail-seed blob internals
(review m1): a minimal JPEG for the photo, and a tiny non-image (e.g. a
text/plain or PDF blob) for the rejection case. It then references the image blob
from a Media entry on a created Card.

## Test plan (this chunk's DoD slice)

- **Upload → reference → read-back**: upload an image blob; create a Card whose
  `media` map has an entry `{ "@type":"Media", kind:"photo", blobId:<id> }`
  (per RFC 9610's blob-reference form); `ContactCard/get` returns that media
  entry carrying a **`blobId`** (not a `data:` URI) **and** a `mediaType` of
  `image/*` (RFC 9610 §3 — mediaType MUST also be set, review m2); the returned
  blob id is a valid Id.
- **Round-trip fetch**: `download` the returned `blobId` and assert the bytes /
  size match what was uploaded (content-type image/*).
- **Non-image rejected**: reference the uploaded non-image blob as a
  `kind:"photo"` media entry → `notCreated`/`invalidProperties`. RFC 9610 §3.5
  makes this a server **MUST** ("MUST reject … not a recognised image type as the
  photo"), so the test is **`required:true`** (review M1/RFC-#1). If `unifyd` does
  not reject, that red is a real conformance finding to file as a `unifyd` gap —
  not a reason to downgrade the test.
- **Cleanup**: created card destroyed in `finally`.

## Done-criteria

- AC covered: 1 (photo/media path), 5 (green vs unifyd).
- Gate: `npm run build` clean; `--filter 'contacts/media'` required-green vs
  `unifyd` (photo `blobId`+`mediaType` round-trip and the non-image-rejection MUST
  both `required:true`; a `unifyd` miss surfaces as a filed gap, not a downgrade).
