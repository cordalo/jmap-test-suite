import { defineTests } from "../../runner/test-registry.js";
import { JmapMethodError } from "../../client/jmap-client.js";
import { needsContacts } from "./_capability.js";
import { buildCard } from "../../setup/seed-contacts.js";
import type { TestContext } from "../../runner/test-context.js";

// RFC 9610 §3.4 ContactCard/queryChanges (standard /queryChanges, RFC 8620 §5.6).
// Whether a server can calculate query changes is optional (canCalculateChanges
// may be false), so the delta assertions are recommended (WARN); the method's
// existence and its cannotCalculateChanges behavior are required.

async function queryState(ctx: TestContext): Promise<{ state: string; canCalc: boolean }> {
  const r = await ctx.client.call("ContactCard/query", {
    accountId: ctx.contactsAccountId!,
    filter: {},
  });
  return { state: r.queryState as string, canCalc: r.canCalculateChanges as boolean };
}

defineTests({ rfc: "RFC9610", section: "3.4", category: "contacts" }, [
  {
    id: "query-changes-added",
    name: "ContactCard/queryChanges reports a newly created card in added",
    required: false,
    runIf: needsContacts,
    fn: async (ctx) => {
      const { state, canCalc } = await queryState(ctx);
      if (!canCalc) {
        // Server declares it cannot calculate query changes — nothing to assert.
        return;
      }
      const created = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        create: {
          c: { ...buildCard({ uid: "urn:example:contacts:qc-added" }), addressBookIds: { [ctx.addressBookIds["bookMain"]]: true } },
        },
      });
      const id = (created.created as Record<string, { id: string }>).c.id;
      try {
        const qc = await ctx.client.call("ContactCard/queryChanges", {
          accountId: ctx.contactsAccountId!,
          filter: {},
          sinceQueryState: state,
        });
        const added = qc.added as Array<{ id: string; index: number }>;
        ctx.assert(Array.isArray(added), "added must be an array");
        ctx.assert(added.some((a) => a.id === id), "new card must appear in added");
      } finally {
        await ctx.client.call("ContactCard/set", {
          accountId: ctx.contactsAccountId!,
          destroy: [id],
        });
      }
    },
  },
  {
    id: "query-changes-structure",
    name: "ContactCard/queryChanges returns a well-formed response",
    required: false,
    runIf: needsContacts,
    fn: async (ctx) => {
      const { state, canCalc } = await queryState(ctx);
      if (!canCalc) return;
      const qc = await ctx.client.call("ContactCard/queryChanges", {
        accountId: ctx.contactsAccountId!,
        filter: {},
        sinceQueryState: state,
      });
      ctx.assertEqual(qc.oldQueryState, state);
      ctx.assertType(qc.newQueryState, "string");
      ctx.assert(Array.isArray(qc.added), "added must be an array");
      ctx.assert(Array.isArray(qc.removed), "removed must be an array");
    },
  },
  {
    id: "query-changes-cannot-calculate",
    name: "ContactCard/queryChanges returns cannotCalculateChanges for an unknown state",
    runIf: needsContacts,
    fn: async (ctx) => {
      try {
        await ctx.client.call("ContactCard/queryChanges", {
          accountId: ctx.contactsAccountId!,
          filter: {},
          sinceQueryState: "not-a-real-query-state-000",
        });
        ctx.assert(false, "expected cannotCalculateChanges for an unknown sinceQueryState");
      } catch (err) {
        if (!(err instanceof JmapMethodError)) throw err;
        ctx.assertEqual(err.type, "cannotCalculateChanges");
      }
    },
  },
]);
