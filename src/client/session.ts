import type { Session } from "../types/jmap-core.js";
import type { Transport } from "./transport.js";

export async function fetchSession(
  transport: Transport,
  sessionUrl: string
): Promise<Session> {
  const session = await transport.fetchJson<Session>(sessionUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  validateSession(session);
  return session;
}

function validateSession(session: Session): void {
  const required: (keyof Session)[] = [
    "capabilities",
    "accounts",
    "primaryAccounts",
    "username",
    "apiUrl",
    "downloadUrl",
    "uploadUrl",
    "eventSourceUrl",
    "state",
  ];

  for (const key of required) {
    if (session[key] == null) {
      throw new Error(`Session resource missing required property: ${key}`);
    }
  }

  if (typeof session.capabilities !== "object") {
    throw new Error("Session 'capabilities' must be an object");
  }

  if (typeof session.accounts !== "object") {
    throw new Error("Session 'accounts' must be an object");
  }

  if (typeof session.primaryAccounts !== "object") {
    throw new Error("Session 'primaryAccounts' must be an object");
  }

  if (!session.capabilities["urn:ietf:params:jmap:core"]) {
    throw new Error("Session must advertise urn:ietf:params:jmap:core capability");
  }
}

/**
 * Resolve the account id to use for a capability: the primary account for it if
 * declared, else the first account whose accountCapabilities advertise it.
 * Throws if the session exposes no account for the capability at all.
 */
export function getAccountId(session: Session, capability: string): string {
  const primary = session.primaryAccounts[capability];
  if (primary) {
    if (!session.accounts[primary]) {
      throw new Error(
        `Primary account ${primary} for ${capability} not found in session accounts`
      );
    }
    return primary;
  }

  // Fallback: scan accounts for one that advertises the capability.
  for (const [acctId, acct] of Object.entries(session.accounts)) {
    if (capability in acct.accountCapabilities) {
      return acctId;
    }
  }

  throw new Error(`No account found for capability ${capability}`);
}

export function getMailAccountId(session: Session): string {
  return getAccountId(session, "urn:ietf:params:jmap:mail");
}

/**
 * The id of an account (other than `excludeAccountId`) that advertises the given
 * capability, if any — used to locate a cross-account target for /copy tests.
 */
export function findCrossAccountId(
  session: Session,
  capability: string,
  excludeAccountId: string
): string | undefined {
  for (const [acctId, acct] of Object.entries(session.accounts)) {
    if (acctId !== excludeAccountId && capability in acct.accountCapabilities) {
      return acctId;
    }
  }
  return undefined;
}

export function hasCapability(session: Session, capability: string): boolean {
  return capability in session.capabilities;
}

export function getAccountCapabilities(
  session: Session,
  accountId: string
): Record<string, unknown> {
  const account = session.accounts[accountId];
  if (!account) {
    throw new Error(`Account ${accountId} not found in session`);
  }
  return account.accountCapabilities;
}
