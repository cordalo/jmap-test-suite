# Sprint 001 · Chunk 02 — AddressBook get / changes / set

> References: `decision.md` (AC 1, 5, 6), `definition-of-done.md` (edge cases).
> RFC 9610 §AddressBook (object, methods, set behaviors, errors). Not restated.

## Scope

The full `AddressBook` method surface: `get`, `changes`, `set`. RFC 9610 defines
**no** `AddressBook/query` or `queryChanges` — a negative test asserts the server
rejects `AddressBook/query` (mirrors `unifyd`'s documented `unknownMethod`). New
files under `src/tests/addressbook/`, registered in `cli.ts`. Every test
`runIf`-gated on the contacts capability.

## Approach

New files (category `addressbook`):
- `addressbook-get.test.ts`
- `addressbook-changes.test.ts`
- `addressbook-set.test.ts`

All use `ctx.contactsAccountId` and `ctx.client.call(...)` (contacts URN now in
`defaultUsing`). Set-tests create/destroy their own books in `finally`; get/
changes read the seeded `ctx.addressBookIds` plus their own fixtures.

**Destructive edges use their own throwaway book AND card** (review M5): the
`addressBookHasContents` and `onDestroyRemoveContents:true` tests create a
disposable book, put a disposable card in it via the chunk-01 `buildCard` +
`ContactCard/set`, then exercise the destroy. They **never** destroy a seeded
book (chunks 03–06 reuse those). This is why chunk 02 depends on chunk 01's
`buildCard`/`ContactCard/set` even though `ContactCard` tests proper come later.

## Test plan (this chunk's DoD slice)

**get** — get-all (`ids:null`); get by ids; `properties` projection; unknown id →
`notFound` String[]; required props present and typed (`id`, `name`,
`description|null`, `sortOrder` UnsignedInt, `isDefault` Boolean, `isSubscribed`
Boolean, `myRights` object with `mayRead/mayWrite/mayShare/mayDelete` Booleans);
**exactly one** book has `isDefault:true` across the account.

**changes** — `changes` since a known state returns created/updated/destroyed
arrays + `newState`; a create then an update then a destroy land in the right
buckets across successive states; an unknown/old state → `cannotCalculateChanges`.

**set** — create (name required; empty name rejected; name > 255 octets rejected;
`sortOrder` defaults 0; `description` defaults null); update (rename, sortOrder,
`isSubscribed`); server-set props (`id`, `isDefault`, `myRights`) supplied on
create → rejected in `notCreated`/`invalidProperties`; destroy an empty custom
book; destroy a **non-empty** book with `onDestroyRemoveContents:false` →
`addressBookHasContents` in `notDestroyed`; the `onDestroyRemoveContents:true`
path destroys the book and its otherwise-unreferenced cards;
`onSuccessSetIsDefault` names a book default on success. `shareWith` without the
`mayShare` right → `forbidden` (`required:false`/WARN — sharing is server-optional).

**no-query negative** — `AddressBook/query` → method-level error (`unknownMethod`
or equivalent); assert the error `type`, not a specific string beyond the JMAP
set.

## Done-criteria

- AC covered: 1 (AddressBook surface), 5 (green vs unifyd), 6 (self-clean).
- Gate: `npm run build` clean; `--filter 'addressbook/*'` required-green vs
  `unifyd`; sharing/WARN tests never required-fail.
