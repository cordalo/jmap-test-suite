import { hasCapability } from "../../client/session.js";
import { CONTACTS_CAPABILITY } from "../../types/jmap-contacts.js";
import type { TestContext } from "../../runner/test-context.js";

/**
 * `runIf` gate for the contacts categories — skips (does not fail) when the
 * server does not advertise the contacts capability. The `vacation` category's
 * `needsVacation` is the reference pattern.
 */
export const needsContacts = (ctx: TestContext): true | string =>
  hasCapability(ctx.session, CONTACTS_CAPABILITY)
    ? true
    : "Server does not support contacts (urn:ietf:params:jmap:contacts)";
