# Sprint 001 · Chunk 05 — ContactCard set + copy

> References: `decision.md` (AC 1, 5), `definition-of-done.md` (invalid-Card,
> `addressBookIds` rule, PatchObject, cross-account). RFC 9610 §ContactCard/set,
> §ContactCard/copy; RFC 9553 §Card + sub-objects. Not restated.

## Scope

`ContactCard/set` (create / update / destroy) and `ContactCard/copy`. New files
under `src/tests/contacts/`, category `contacts`, capability-gated. Tests create
and destroy their own cards in `finally`; copy uses a contacts-capable second
account and skips when none is available (the `email-copy` pattern).

## Approach

New files:
- `contactcard-set-create.test.ts`
- `contactcard-set-update.test.ts`
- `contactcard-set-destroy.test.ts`
- `contactcard-copy.test.ts`

A shared `buildCard(opts)` helper (introduced in chunk 1, extended here) produces
valid JSContact Cards. Minimal valid Card = `{ "@type":"Card", "version":"1.0",
"uid":"urn:uuid:<literal>" }` plus `addressBookIds`.

## Test plan (this chunk's DoD slice)

**create**
- Minimal valid Card (`@type`/`version`/`uid` + `addressBookIds`) → created;
  server assigns `id`.
- Rich Card: `name` (components given/surname + `full`), `emails` (address +
  contexts + pref), `phones` (number + features), `addresses` (components +
  countryCode), `organizations`, `kind:"individual"` → round-trips via a
  follow-up `get`.
- Group Card: `kind:"group"` + `members` map of uids.
- `addressBookIds` MUST be a non-empty map with **all values `true`**: reject
  empty map, reject a `false` value, reject an unknown book id (→ `notCreated`
  with `invalidProperties`/`notFound`-shaped SetError).
- Missing required Card prop (`@type` / `version` / `uid`) → `notCreated`
  (`invalidProperties` or the server's documented invalid-Card `type`).
- Invalid `kind` value → rejected.
- **Duplicate `uid`** (review M7): creating a card whose `uid` collides with an
  existing card in the account is rejected in `notCreated` (RFC 9610 §3 — MUST NOT
  have two cards with the same uid in an account). `required:true`.
- Intra-set creation reference: create a book id via result-reference / creation
  id and place a card in it in one request (if exercised — otherwise covered by
  the seed path).

**update**
- PatchObject (JSON-pointer) patches: set `name/full`, add an entry under
  `emails/*`, change `kind`; a `get` confirms only the patched paths changed.
- Move a card between books by replacing `addressBookIds`.
- Reject a patch that would remove a required Card property or empty
  `addressBookIds`.
- `notFound`/`invalidPatch` for an unknown id or malformed pointer.

**destroy**
- Destroy a created card → id in `destroyed`; a second destroy → `notDestroyed`
  (`notFound`).

**copy**
- `ContactCard/copy` a card from the primary contacts account into a second
  contacts-capable account; the copy is a new object (new `id`) with the same Card
  content; `onSuccessDestroyOriginal` if exercised.
- `runIf`: gate on **`ctx.contactsCrossAccountId`** (the dedicated contacts scan
  from chunk 01 — **not** `ctx.crossAccountId`, review M3). The `unifyd` test
  config is expected to provide a contacts-capable second account so this runs
  required-green; because the DoD execution-count gate fails a silent all-skip
  run, a missing second account surfaces as a gate failure to resolve (provision
  it) rather than a false green (review M4). If the deployment genuinely cannot
  provide one, the run report marks the copy surface **unverified**.

## Done-criteria

- AC covered: 1 (write + copy surface), 5 (green vs unifyd).
- Gate: `npm run build` clean; `--filter 'contacts/set*,contacts/copy*'`
  required-green vs `unifyd`; copy skips cleanly when no second account.
