import { test } from "node:test";
import assert from "node:assert/strict";
import { getAccountId, findCrossAccountId, hasCapability } from "../../client/session.js";
import { CONTACTS_CAPABILITY } from "../../types/jmap-contacts.js";
import type { Session, Account } from "../../types/jmap-core.js";

// Unit tests for the account-resolution seams introduced for contacts. These are
// pure functions of a Session object, so they exercise branches a same-account,
// always-contacts-capable live server (unifyd) never hits — notably the
// getAccountId fallback (review m8) and the capability-absent skip path (review M1).

function mkAccount(caps: string[]): Account {
  return {
    name: "acct",
    isPersonal: true,
    isReadOnly: false,
    accountCapabilities: Object.fromEntries(caps.map((c) => [c, {}])),
  };
}

function mkSession(opts: {
  accounts: Record<string, Account>;
  primaryAccounts: Record<string, string>;
  capabilities?: Record<string, unknown>;
}): Session {
  return {
    capabilities: opts.capabilities ?? {},
    accounts: opts.accounts,
    primaryAccounts: opts.primaryAccounts,
    username: "u",
    apiUrl: "/api",
    downloadUrl: "/dl",
    uploadUrl: "/ul",
    eventSourceUrl: "/es",
    state: "s",
  };
}

test("getAccountId returns the primary account when declared", () => {
  const session = mkSession({
    accounts: { A: mkAccount([CONTACTS_CAPABILITY]) },
    primaryAccounts: { [CONTACTS_CAPABILITY]: "A" },
  });
  assert.equal(getAccountId(session, CONTACTS_CAPABILITY), "A");
});

test("getAccountId falls back to an account advertising the capability when no primary is declared", () => {
  // Capability present in accountCapabilities but absent from primaryAccounts —
  // the branch a same-account unifyd never reaches.
  const session = mkSession({
    accounts: {
      mail: mkAccount(["urn:ietf:params:jmap:mail"]),
      book: mkAccount([CONTACTS_CAPABILITY]),
    },
    primaryAccounts: { "urn:ietf:params:jmap:mail": "mail" },
  });
  assert.equal(getAccountId(session, CONTACTS_CAPABILITY), "book");
});

test("getAccountId throws when no account exposes the capability", () => {
  const session = mkSession({
    accounts: { mail: mkAccount(["urn:ietf:params:jmap:mail"]) },
    primaryAccounts: { "urn:ietf:params:jmap:mail": "mail" },
  });
  assert.throws(() => getAccountId(session, CONTACTS_CAPABILITY), /No account found/);
});

test("findCrossAccountId returns a different contacts-capable account, else undefined", () => {
  const two = mkSession({
    accounts: {
      A: mkAccount([CONTACTS_CAPABILITY]),
      B: mkAccount([CONTACTS_CAPABILITY]),
    },
    primaryAccounts: { [CONTACTS_CAPABILITY]: "A" },
  });
  assert.equal(findCrossAccountId(two, CONTACTS_CAPABILITY, "A"), "B");

  const one = mkSession({
    accounts: { A: mkAccount([CONTACTS_CAPABILITY]) },
    primaryAccounts: { [CONTACTS_CAPABILITY]: "A" },
  });
  assert.equal(findCrossAccountId(one, CONTACTS_CAPABILITY, "A"), undefined);
});

test("hasCapability reflects session-level advertisement", () => {
  const withCap = mkSession({
    accounts: { A: mkAccount([CONTACTS_CAPABILITY]) },
    primaryAccounts: {},
    capabilities: { [CONTACTS_CAPABILITY]: {} },
  });
  const without = mkSession({ accounts: {}, primaryAccounts: {}, capabilities: {} });
  assert.equal(hasCapability(withCap, CONTACTS_CAPABILITY), true);
  assert.equal(hasCapability(without, CONTACTS_CAPABILITY), false);
});
