# Sprint 001 · Chunk 04 — ContactCard query / queryChanges

> References: `decision.md` (AC 2, 5), `definition-of-done.md` (filter + sort
> surface, phrase-vs-token). RFC 9610 §ContactCard/query. Not restated.

## Scope

`ContactCard/query` (every FilterCondition + all sorts) and
`ContactCard/queryChanges`. New files under `src/tests/contacts/`, category
`contacts`, capability-gated. Relies on the deterministic seeded fixtures
(distinct names/emails/phones/orgs/addresses/uids from chunk 1) so each filter
has a known-cardinality expected result.

## Approach

New files:
- `contactcard-query.test.ts`
- `contactcard-query-changes.test.ts`

Convention: never send `filter: null` — omit `filter`, or send `{}` (per the
suite rule and `unifyd`'s stricter parsing). All queries scope to
`ctx.contactsAccountId`.

Two cross-cutting rules from the review:
- **Time-window filters & the `created`/`updated` sorts derive expected values
  from the seed's read-back `ctx.contactCardMeta` (review M2)** — e.g.
  `createdAfter: alice.created` must return bob and exclude alice — never from
  hardcoded timestamps.
- **`text`/`name` full-text filters assume contacts search is indexed by the time
  the query runs (review m5).** Confirm `unifyd` indexes contacts synchronously at
  write; if not, use assert-with-retry for the search-backed conditions.

## Test plan (this chunk's DoD slice)

**FilterConditions** — one focused test each (assert the seeded card(s) that must
match are returned and a known non-match is excluded):
`inAddressBook`, `uid`, `hasMember` (group card resolves a member uid), `kind`,
`createdBefore`, `createdAfter`, `updatedBefore`, `updatedAfter`, `text`, `name`,
`name/given`, `name/surname`, `name/surname2`, `nickname`, `organization`,
`email`, `phone`, `onlineService`, `address`, `note`.
- The seed now provides `onlineService` and `name/surname2` data (chunk 01), so
  those get real match assertions. Any FilterCondition that still cannot be made
  deterministic gets a well-formed-response-and-no-error test, `required:false`
  **only** because the match cannot be guaranteed by data — not to hide a MUST
  (review M1); the DoD records which conditions are covered this way.

**Filter combinators / semantics**
- `filter:{}` and omitted filter: assert the seeded uids are a **subset** of the
  result (specific cards present), not an exact account-wide count — other tests'
  cards coexist at runtime (review m4).
- AND semantics: two conditions in one FilterCondition narrow the result.
- FilterOperator `AND`/`OR`/`NOT` over conditions (RFC 8620 §5.5) if the server
  supports operators for this type.
- Phrase (quoted) vs token (unquoted whitespace, all-present) `text`/`name`
  matching; case-insensitivity.

**Sort**
- MUST (`required:true`): `created` asc/desc, `updated` asc/desc — verify order
  against known seeded timestamps.
- SHOULD (`required:false`/WARN): `name/given`, `name/surname`, `name/surname2`.

**Paging** — `position`, `limit`, `anchor`/`anchorOffset`, `total` with
`calculateTotal`, matching the mail query-paging tests' shape.

**queryChanges** — from a known `queryState`, a create/destroy that enters/leaves
the result set is reported in `added`/`removed`; `cannotCalculateChanges` for an
unknown state; `upToId` honored.

## Done-criteria

- AC covered: 2 (every FilterCondition + sorts), 5 (green vs unifyd).
- Gate: `npm run build` clean; `--filter 'contacts/query*'` required tests green
  vs `unifyd`; SHOULD-sort and non-deterministic-filter tests WARN-safe.
