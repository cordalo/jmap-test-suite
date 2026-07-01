# Sprint 001 · Chunk 01 — Framework enablement

> References: `decision.md` (AC 3, 4, 6, 7; Constraints), `definition-of-done.md`
> (integration points, lifecycle). RFC 9610 §capability, §AddressBook. Not restated.

## Scope

Generalize the four mail-specific framework seams so contacts (and, later,
calendars) plug in; seed contacts fixtures; extend account cleanup; capture the
RFC clarifications. No contacts *tests* register in this chunk — it is the
substrate the next chunks build on. The suite must still run green on mail with
the contacts capability absent (every contacts path a no-op).

## Approach

### Capability + `using`
- `client/session.ts`: `hasCapability()` already exists. Add
  `getAccountId(session, capability): string` (generalizes `getMailAccountId`,
  which stays as a thin wrapper). Reads `primaryAccounts[capability]`, falls back
  to scanning `accounts` for one whose `accountCapabilities` contains the
  capability; throws only if none.
- `client/jmap-client.ts`: `defaultUsing()` conditionally pushes
  `urn:ietf:params:jmap:contacts` when the session advertises it (mirrors the
  submission/vacation blocks). Contacts constant defined once, e.g.
  `CONTACTS_CAP = "urn:ietf:params:jmap:contacts"`.

### Context
- `runner/test-context.ts`: add `contactsAccountId?: string`,
  `addressBookIds: Record<string,Id> = {}`, `contactCardIds: Record<string,Id> = {}`.
- `runner/test-runner.ts`: after client init, resolve
  `ctx.contactsAccountId = hasCapability(session, CONTACTS_CAP) ? getAccountId(session, CONTACTS_CAP) : undefined`.
  For `ContactCard/copy`, resolve a **dedicated** `ctx.contactsCrossAccountId` via
  a **separate** scan of `session.accounts` for one (≠ primary) whose
  `accountCapabilities` contains `CONTACTS_CAP`. Do **not** reuse
  `ctx.crossAccountId` — that field is mail-capable and is consumed by
  `email-copy`/`blob-copy`; gating it on contacts would regress those (review M3).
  Log the resolved `contactsAccountId` + discovered capability at startup, and
  record the executed-vs-registered contacts test count so the DoD execution-count
  gate (review B2) can fail a silent all-skip run.

### Seed
- `setup/seed-data.ts` (or a new `setup/seed-contacts.ts` called from
  `seedData`): `seedContacts(ctx)` — **guarded by `hasCapability`**; no-op when
  absent. Creates:
  - two AddressBooks via `AddressBook/set` (`bookMain`, `bookOther`), recording
    ids in `ctx.addressBookIds`.
  - ~7 ContactCards via `ContactCard/set` into `bookMain`, keyed for reuse by get/
    query/changes: `alice` (individual, full name given/surname + work email +
    mobile phone + org "Acme" + an `onlineServices` entry), `bob` (individual,
    home email, address in "Springfield", a `name/surname2` component), `carol`
    (individual, nickname "CJ", note text), `dave` (individual, in `bookOther`),
    `team` (kind group, `members` referencing alice+bob uids), `minimal` (only
    `@type`/`version`/`uid`). Each Card gets a stable `uid` (`urn:uuid:...`-style
    literal) so `uid`/`hasMember` filters are deterministic. The extra
    `onlineServices` and `name/surname2` data give the corresponding
    FilterConditions real matches instead of well-formed-only tests (review m3).
  - The seed **reads back** each card's server-assigned `created`/`updated` from
    the `ContactCard/set`/`get` response and stores them on `ctx` (e.g.
    `ctx.contactCardMeta[key] = { created, updated }`), so chunk 04's time-window
    filters and `created`/`updated` sorts derive expected values relative to a
    specific card rather than hardcoding timestamps (review M2). Where ordering
    matters, cards are created in separate calls to guarantee distinct timestamps.
  Records `ctx.contactCardIds`. A small exported `buildCard(opts)` helper
  assembles a valid JSContact Card (see chunk 3/5 for the shape); it is written
  defensively — a malformed shape here aborts the whole suite, since the seed runs
  on every `unifyd` run (the capability is always advertised, review m9).

### Clean / teardown
- `setup/clean-account.ts`: when the contacts capability is present, count
  `AddressBook`/`ContactCard` toward the "account not empty" gate and, under
  `-f`, force-clean — destroy all `ContactCard`s (query/get ids → `ContactCard/set
  destroy`), then destroy custom `AddressBook`s with `onDestroyRemoveContents:true`.
  Guarded so a mail-only server is unaffected.
- `setup/teardown.ts`: destroy the seeded contacts objects (cards before books).

### Types + config
- `types/jmap-mail.ts` is mail; add a small `types/jmap-contacts.ts` with the
  `AddressBook`, `AddressBookRights`, `ContactCard`, and JSContact `Card`
  (subset) interfaces used by the tests. No config schema change is required —
  contacts uses the same session/users config.

### Regression baseline
- Before changing any framework code, run the full suite against the `unifyd`
  config and commit the per-category `requiredPassed`/`requiredFailed` snapshot
  under the sprint dir (review M6). This is the reference the DoD's no-regression
  gate diffs against.

### Self-seam coverage (this chunk registers no live-server tests, so its own new
### code is otherwise only indirectly exercised — reviews m8/m9)
- A direct unit test drives the capability gate with a **synthesized session that
  lacks** `urn:ietf:params:jmap:contacts` and asserts the contacts tests SKIP (not
  fail) — this is how AC 3 is confirmed without a non-contacts server (review M1/
  coherence-#1), since `unifyd` always advertises the capability.
- A direct unit test drives `getAccountId(session, cap)` with a synthesized
  session where the capability is present in `accounts[...].accountCapabilities`
  but **absent from `primaryAccounts`**, asserting the fallback scan resolves the
  right account (review m8) — the branch a same-account `unifyd` never hits.

### Reference doc
- Add a Contacts section to `rfc-clarifications.md` (or a sibling
  `rfc-contacts-clarifications.md` matching the repo's convention): the RFC
  9610/9553 interpretation decisions the tests rest on — minimal-Card shape,
  `addressBookIds` all-`true` rule, `isDefault` exactly-one, photo→`blobId`,
  phrase-vs-token query semantics, which sorts are MUST vs SHOULD.

## Done-criteria (this chunk's slice)

- AC covered: 3 (gating substrate + skip-path unit test), 4 (account/using +
  resolver fallback unit test), 6 (lifecycle), 7 (docs).
- Tests: two direct unit tests of the new seams (capability-gate skip; resolver
  fallback); no live-server contacts tests yet. Framework correctness is otherwise
  proven by the **existing suite still passing** against `unifyd` and by the
  seed/clean path running without error.
- Gate: `npm run build` clean; regression baseline committed; full suite run vs
  `unifyd` shows `required` counts equal to the baseline (no new failures); the
  seed runs against `unifyd` (the real regression surface — not just `tsc`) and
  teardown restores the account.
