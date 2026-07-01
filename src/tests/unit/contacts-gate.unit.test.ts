import { test } from "node:test";
import assert from "node:assert/strict";
import { needsContacts } from "../contacts/_capability.js";
import { CONTACTS_CAPABILITY } from "../../types/jmap-contacts.js";
import type { TestContext } from "../../runner/test-context.js";
import type { Session } from "../../types/jmap-core.js";

// Confirms AC 3 — the contacts categories SKIP (not fail) when the server does
// not advertise the contacts capability (review M1). unifyd always advertises
// it, so this branch can only be verified against a synthesized session.

function ctxWithCapabilities(capabilities: Record<string, unknown>): TestContext {
  const session = { capabilities } as Session;
  return { session } as TestContext;
}

test("needsContacts runs (true) when the contacts capability is advertised", () => {
  const ctx = ctxWithCapabilities({ [CONTACTS_CAPABILITY]: {} });
  assert.equal(needsContacts(ctx), true);
});

test("needsContacts skips (string reason) when the contacts capability is absent", () => {
  const ctx = ctxWithCapabilities({ "urn:ietf:params:jmap:mail": {} });
  const result = needsContacts(ctx);
  assert.equal(typeof result, "string");
  assert.match(result as string, /does not support contacts/);
});
