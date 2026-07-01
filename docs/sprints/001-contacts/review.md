# Sprint 001 (contacts) — Adversarial review log

Four clean subagents (no planning-conversation context) attacked the plan across
six lenses: problem↔plan coherence, acceptance-criteria quality, RFC 9610/9553
fidelity, chunk independence, framework reality, definition-of-done adequacy, and
hidden assumptions. Findings and dispositions below. Severity: BLOCKER (would let
a broken/partial build pass), MATERIAL (correctness-affecting), MINOR.

The RFC-fidelity pass independently verified — against downloaded RFC text — that
the method surface, all 20 `ContactCard/query` FilterConditions, the sort MUST/
SHOULD split, minimal-Card shape, `addressBookIds` all-`true` rule,
`addressBookHasContents`, `onDestroyRemoveContents`, AddressBookRights names, and
media→`blobId` form are all **correct as written**. The findings are therefore
about *verifiability against a single oracle* and *missed MUSTs*, not about a
mis-specified surface.

## BLOCKER

### B1 — Oracle and tests can share a bug (unifyd is the only reference)
*Lens: DoD adequacy #1.* Validating `required` tests only against `unifyd` means
the sole feedback signal is unifyd's own output; any assertion gets tuned until
unifyd passes, so a test encoding unifyd's *wrong* behavior is declared done and
validates nothing.
**Disposition: FIXED.** `definition-of-done.md` now requires every `required:true`
assertion to (a) cite the specific RFC 9610/9553 MUST it encodes and (b) derive
its expected value from the RFC text / RFC examples / hand-computed vectors —
never from an observed unifyd response. Those vectors are recorded in the
clarifications doc so a reviewer can check assertion-vs-spec without running the
server. A unifyd result is used only to *run* the test, never to *author* the
expectation.

### B2 — Silent all-skip green (misconfig indistinguishable from success)
*Lens: DoD adequacy #4/#6.* `cli.ts` exit code keys on `requiredFailed>0` only;
SKIP never fails the gate. A capability/account/URN misconfig where every
contacts test SKIPs exits 0 and prints green, having tested nothing.
**Disposition: FIXED.** The gate (DoD) and chunk 1 now require: against the
known-contacts-capable `unifyd` config, the count of **executed (non-skip)**
`contacts` + `addressbook` tests must be `> 0` and equal the expected registered
count; the runner logs the resolved `contactsAccountId` and discovered capability
at startup. A run that skips the contacts surface is a gate FAILURE, not a pass.

## MATERIAL

### M1 — `required:true/false` was a gameable goalpost; tune-to-green demotion
*Lenses: AC quality #1/#2, DoD #2, RFC #1.* Chunks 04/06 allowed downgrading a
test to `required:false` (whose FAIL renders as "WARN" and is invisible to the
gate) whenever unifyd was inconvenient — including the non-image-photo rejection,
which RFC 9610 §3.5 makes an unconditional server **MUST**.
**Disposition: FIXED.** DoD now separates two axes that were conflated:
(a) **spec obligation** — MUST → `required:true` always; SHOULD/MAY → `required:false`.
(b) **fixture determinism** — a non-deterministic fixture is a *fixture* problem,
never a reason to demote a MUST. The only admissible reasons for `required:false`
are enumerated: a genuine RFC SHOULD/MAY (e.g. `shareWith`, the SHOULD sorts), or
a server-optional capability. A MUST that unifyd fails stays `required:true` and
its failure is a **filed unifyd conformance gap** — that is the sprint's product,
not something to hide. Non-image-photo rejection is `required:true`.

### M2 — Time-window filters & MUST sorts assume timestamps the seed can't control
*Lenses: coherence #1(sort), DoD #8.* `created`/`updated` are server-assigned;
chunk 04's `createdBefore/After`, `updatedBefore/After`, and the `created`/
`updated` MUST-sorts referenced "known seeded timestamps" that the seed does not
own.
**Disposition: FIXED.** Chunk 01's seed now reads back and stores each card's
server-returned `created`/`updated`; chunk 04 derives boundary values *relative to
a specific seeded card* (e.g. `createdAfter: alice.created` must return bob, not
alice) and asserts sort order against the recorded values — no hardcoded times.

### M3 — Contacts cross-account seam self-conflicting; reusing `crossAccountId` regresses mail
*Lens: framework reality #1.* `test-runner.ts` scans only for a **mail**-capable
cross-account into `ctx.crossAccountId`, consumed by `email-copy`/`blob-copy`.
Chunk 01 offered "reuse `crossAccountId` if contacts-capable" — which would make
the mail copy tests skip/misfire on a mail-only-cross-account server.
**Disposition: FIXED.** Chunk 01 now mandates a **dedicated** `ctx.contactsCrossAccountId`
resolved by a *separate* scan for `CONTACTS_CAP`; the "reuse `crossAccountId`"
option is deleted. Chunk 05's copy test `runIf`-gates on `ctx.contactsCrossAccountId`.

### M4 — `ContactCard/copy` risks being skip-only (AC1 surface unverified)
*Lenses: coherence #3, DoD #7.* If the unifyd config's second account is not
contacts-capable, copy always skips, yet `copy` is part of the AC-1 required
surface and the "method exists" bar passes on registration alone.
**Disposition: FIXED (spec'd) + tied to B2.** Chunk 05 + DoD now state the unifyd
test config **must** provide a contacts-capable second account so copy is
required-green; provisioning uses the same mechanism as the mail cross-account.
Because B2 fails the run if contacts tests skip, a missing second account surfaces
as a gate failure to be resolved (provision it), not a silent green. If the
deployment genuinely cannot provide one, copy is marked **unverified** in the run
report (explicitly, not "covered").

### M5 — Chunk 02 destructive AddressBook edges need their own card and must not touch the seed
*Lens: framework reality #2.* The `addressBookHasContents` and
`onDestroyRemoveContents:true` paths require a card inside a throwaway book;
destroying a seeded book would delete fixtures chunks 03–06 reuse.
**Disposition: FIXED.** Chunk 02 now states explicitly that it creates its own
disposable book **and** card (via the chunk-01 `buildCard` + `ContactCard/set`)
for the destructive edges and never destroys a seeded book. The chunk-01
dependency (`buildCard`/`ContactCard/set` land in chunk 1) is noted in its
depends-on.

### M6 — "No mail regression" has no baseline artifact
*Lenses: AC quality #3, DoD #3.* AC5 requires "no regression," but no pre-sprint
per-category pass/skip/fail counts are recorded, and live runs already emit
nondeterministic SKIPs (cross-account, smee) — so "unchanged" is unfalsifiable.
**Disposition: FIXED.** Chunk 01 captures a **baseline snapshot** (per-category
`requiredPassed`/`requiredFailed` against the unifyd config, target
`requiredFailed==0`) committed under the sprint dir; the regression gate asserts
equality against it, comparing `required` counts (skip-tolerant).

### M7 — uid-uniqueness MUST NOT is never tested
*Lens: RFC fidelity #2.* RFC 9610 §3: "there MUST NOT be more than one
ContactCard with the same uid in an Account." No chunk tested it.
**Disposition: FIXED.** Chunk 05 adds a create test: a card whose `uid` collides
with an existing card is rejected in `notCreated`.

## MINOR (all FIXED unless noted)

- **m1** (coherence #4, DoD #9, RFC): chunk 06 must upload its **own** image and
  non-image bytes, not depend on mail-seed blob internals. → chunk 06 amended.
- **m2** (RFC #4): on `get` read-back the returned Media MUST also carry
  `mediaType` (RFC 9610 §3), not only `blobId`. → chunk 06 asserts `mediaType`.
- **m3** (AC quality #4): FilterConditions with no seed data (`onlineService`,
  `name/surname2`) satisfied "≥1 test" hollowly. → chunk 01 seed extended to
  cover `onlineService` and a `surname2`-bearing card where feasible; DoD states
  which conditions are covered by a "well-formed-response-only" assertion.
- **m4** (framework #5, DoD): the `{}`/omitted-filter test asserted an exact
  account-wide count, fragile as tests coexist. → chunk 04 asserts seeded uids are
  a **subset** of the result, not an exact total.
- **m5** (DoD #10): `text`/phrase-vs-token filters assume synchronous contacts
  indexing. → chunk 04 confirms sync indexing against unifyd, else assert-with-retry.
- **m6** (DoD #12): nothing verified the union of registered `required` test ids
  covers every method/FilterCondition in the coverage bar. → DoD adds that check.
- **m7** (RFC #3): Organization is valid with `name` **or** `units`. → chunk 03
  asserts the seeded shape / "at least one of name|units," not `name` always.
- **m8** (coherence #4-AC4): the `getAccountId` different-account fallback branch
  isn't hit if unifyd lists contacts in `primaryAccounts`. → chunk 01 adds a
  direct unit test of the resolver's fallback with a synthesized session; AC4
  scoped to "resolver correct + same-account verified live."
- **m9** (framework #3, #4): the seed runs on every unifyd run (cap always
  advertised), so a malformed `buildCard` aborts the whole suite. → chunk 01 DoD
  runs the seed against unifyd (not just `tsc`), and makes `buildCard` robust;
  this is the real regression surface. Also folds M1's skip-path unit test (m8),
  giving chunk 1 direct coverage of its own seams.

## Re-review note

The fixes are additive hardening — they tighten the DoD's `required`-flag
discipline, add a baseline and an execution-count gate, add two MUST tests, and
correct the cross-account seam — without changing the chunk boundaries or the
acceptance-criteria set. Because the **DoD changed materially**, a targeted
re-review of the amended `definition-of-done.md` is offered at Gate B before
execution.
