# Sprint 001 (contacts) — JMAP Contacts conformance coverage

> References `decision.md` (Problem / Acceptance Criteria / Constraints) and
> `definition-of-done.md`. Grounded in RFC 9610 (JMAP for Contacts) and RFC 9553
> (JSContact). Not restated here.

## Technical lead-in

The suite registers tests at import time via `defineTests()` (`runner/
test-registry.ts`) and wires them in through `cli.ts`. Domains are folders under
`src/tests/`. Contacts is added as two new categories — `addressbook` and
`contacts` (ContactCard) — following the same registry, `runIf` capability
gating (the `vacation` category is the reference), self-cleaning-test, and
exchange-recording conventions already in use.

Four framework seams are mail-specific today and are generalized once, in
chunk 1, so every later chunk builds on them:

- **`JmapClient.defaultUsing()`** (`client/jmap-client.ts`) emits only core/mail/
  submission/vacation URNs — a `ContactCard/*` call would be rejected for a
  missing `using` capability. Chunk 1 adds the contacts URN conditionally.
- **Account selection** — `getMailAccountId()` (`client/session.ts`) hardwires
  the mail primary account. Contacts may live under a different account; chunk 1
  adds a capability-parameterized resolver and `ctx.contactsAccountId`.
- **`seedData` / `clean-account` / `teardown`** (`setup/`) know only mailboxes
  and emails. Chunk 1 adds contacts seeding and force-clean, both no-ops when the
  capability is absent.

Ordering is dependency-driven: chunk 1 enables the surface and seeds fixtures;
`AddressBook` (chunk 2) precedes `ContactCard` because a card must belong to a
book; read (chunk 3) precedes query (chunk 4) and write (chunk 5); the photo/
media blob path (chunk 6) builds on the write path.

## Chunks

| # | Outcome | Satisfies (AC) | Done-criteria | Depends on |
|---|---------|----------------|---------------|------------|
| 1 | Framework enablement: contacts `using`, contacts primary + dedicated contacts-cross account, capability gate, seed (with timestamp read-back) + clean lifecycle, regression baseline, self-seam unit tests, RFC clarifications | 3, 4, 6, 7 | `tsc` clean; baseline snapshot committed; full suite `required` counts = baseline (no mail regression); seed runs against `unifyd` + teardown restores; skip-path + resolver-fallback unit tests pass | — |
| 2 | `AddressBook` get / changes / set | 1, 5, 6 | `addressbook/*` required-green vs `unifyd`; `addressBookHasContents` + isDefault + server-set-prop edge cases covered | 1 |
| 3 | `ContactCard` get / changes | 1, 5 | `contacts/get*` + `contacts/changes*` required-green; Card validity (`@type`/`version`/`uid`) + `addressBookIds` shape + `notFound` + `cannotCalculateChanges` covered | 1, 2 |
| 4 | `ContactCard` query / queryChanges | 2, 5 | every FilterCondition + MUST sorts required-green; SHOULD sorts WARN-safe; `{}`/omitted filter + phrase-vs-token covered | 1, 2, 3 |
| 5 | `ContactCard` set (create/update/destroy) + copy | 1, 5 | `contacts/set*` + `contacts/copy*` required-green; invalid-Card, all-`true` `addressBookIds`, PatchObject update, cross-account copy (skip-if-none) covered | 1, 2, 3 |
| 6 | ContactCard photo/media blob path | 1, 5 | photo upload → `blobId` on `get` round-trips; non-image rejected for photo | 1, 5 |

Each chunk is a self-contained pull request against this fork (build green, its
DoD slice met, reviewable) before the next begins.

## Adversarial review

Per `definition-of-done.md` and the sprint protocol, the plan is attacked by
clean subagents (problem↔plan coherence, AC quality, constraint/RFC fidelity,
chunk independence/ordering, DoD adequacy, hidden assumptions) before Gate B.
Findings and dispositions are logged in `review.md`.
