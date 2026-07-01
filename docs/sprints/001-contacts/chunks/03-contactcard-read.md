# Sprint 001 · Chunk 03 — ContactCard get / changes

> References: `decision.md` (AC 1, 5), `definition-of-done.md` (edge cases).
> RFC 9610 §ContactCard; RFC 9553 §Card (required props, kind). Not restated.

## Scope

The `ContactCard` read surface: `get` and `changes`. New files under
`src/tests/contacts/`, category `contacts`, registered in `cli.ts`, capability-
gated. Reads the seeded cards from `ctx.contactCardIds` / `ctx.addressBookIds`.

## Approach

New files:
- `contactcard-get.test.ts`
- `contactcard-changes.test.ts`

Shared expectation of a valid Card body (defined once, reused in chunks 4–6):
`@type === "Card"`, `version` a non-empty string, `uid` a non-empty string; the
metadata `id` (server-set) and `addressBookIds` (map, all values `true`).

## Test plan (this chunk's DoD slice)

**get**
- get-all (`ids:null`) returns the seeded cards; get by explicit ids; unknown id
  → `notFound` String[].
- `properties` projection returns only requested properties (+ always `id`).
- Body validity: every returned card has `@type:"Card"`, `version`, `uid`.
- `addressBookIds` is a non-empty object whose values are **all `true`**; each
  key is a valid Id present in the account's books.
- `kind` absent defaults to (or is returned as) `individual`; the seeded group
  card returns `kind:"group"` with a `members` map.
- A card seeded with name/email/phone/org/address round-trips those sub-objects
  with their required sub-properties (`name.components[].{value,kind}` or
  `name.full`; `emails.*.address`; `phones.*.number`; `addresses.*` components or
  `full`; `organizations.*` with at least one of `name`/`units` — RFC 9553 §2.6.1
  allows a units-only Organization, so assert the seeded shape, not `name` always).
- `notFound` MUST be a String[] (RFC 8620 §5.1), asserted like the vacation test.

**changes**
- `changes` since a known state returns created/updated/destroyed + `newState`;
  a create → update → destroy sequence lands in the correct buckets across states.
- A card **created and destroyed within the same window** appears in no bucket.
- Unknown/too-old state → `cannotCalculateChanges`.
- `maxChanges` honored if the server returns `hasMoreChanges`.

## Done-criteria

- AC covered: 1 (read surface), 5 (green vs unifyd).
- Gate: `npm run build` clean; `--filter 'contacts/get,contacts/changes'`
  required-green vs `unifyd`.
