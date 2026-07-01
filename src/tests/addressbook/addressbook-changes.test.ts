import { defineTests } from "../../runner/test-registry.js";
import { JmapMethodError } from "../../client/jmap-client.js";
import { needsContacts } from "../contacts/_capability.js";

// RFC 9610 §2.2 AddressBook/changes (standard /changes, RFC 8620 §5.2).

async function currentState(ctx: import("../../runner/test-context.js").TestContext): Promise<string> {
  const get = await ctx.client.call("AddressBook/get", {
    accountId: ctx.contactsAccountId!,
    ids: [],
  });
  return get.state as string;
}

defineTests({ rfc: "RFC9610", section: "2.2", category: "addressbook" }, [
  {
    id: "changes-response-structure",
    name: "AddressBook/changes response has all required properties",
    runIf: needsContacts,
    fn: async (ctx) => {
      const state = await currentState(ctx);
      const result = await ctx.client.call("AddressBook/changes", {
        accountId: ctx.contactsAccountId!,
        sinceState: state,
      });
      ctx.assertType(result.accountId, "string");
      ctx.assertEqual(result.oldState, state);
      ctx.assertType(result.newState, "string");
      ctx.assertType(result.hasMoreChanges, "boolean");
      ctx.assert(Array.isArray(result.created), "created must be array");
      ctx.assert(Array.isArray(result.updated), "updated must be array");
      ctx.assert(Array.isArray(result.destroyed), "destroyed must be array");
    },
  },
  {
    id: "changes-none",
    name: "AddressBook/changes with the current state returns empty deltas",
    runIf: needsContacts,
    fn: async (ctx) => {
      const state = await currentState(ctx);
      const result = await ctx.client.call("AddressBook/changes", {
        accountId: ctx.contactsAccountId!,
        sinceState: state,
      });
      ctx.assertLength(result.created as string[], 0);
      ctx.assertLength(result.updated as string[], 0);
      ctx.assertLength(result.destroyed as string[], 0);
    },
  },
  {
    id: "changes-after-create",
    name: "AddressBook/changes reports a newly created book as created",
    runIf: needsContacts,
    fn: async (ctx) => {
      const oldState = await currentState(ctx);
      const set = await ctx.client.call("AddressBook/set", {
        accountId: ctx.contactsAccountId!,
        create: { tmp: { name: "Changes Create Book" } },
      });
      const id = (set.created as Record<string, { id: string }>).tmp.id;
      try {
        const changes = await ctx.client.call("AddressBook/changes", {
          accountId: ctx.contactsAccountId!,
          sinceState: oldState,
        });
        ctx.assertIncludes(changes.created as string[], id);
      } finally {
        await ctx.client.call("AddressBook/set", {
          accountId: ctx.contactsAccountId!,
          destroy: [id],
        });
      }
    },
  },
  {
    id: "changes-after-update",
    name: "AddressBook/changes reports a renamed book as updated",
    runIf: needsContacts,
    fn: async (ctx) => {
      const set = await ctx.client.call("AddressBook/set", {
        accountId: ctx.contactsAccountId!,
        create: { tmp: { name: "Changes Update Before" } },
      });
      const id = (set.created as Record<string, { id: string }>).tmp.id;
      const midState = set.newState as string;
      try {
        await ctx.client.call("AddressBook/set", {
          accountId: ctx.contactsAccountId!,
          update: { [id]: { name: "Changes Update After" } },
        });
        const changes = await ctx.client.call("AddressBook/changes", {
          accountId: ctx.contactsAccountId!,
          sinceState: midState,
        });
        ctx.assertIncludes(changes.updated as string[], id);
      } finally {
        await ctx.client.call("AddressBook/set", {
          accountId: ctx.contactsAccountId!,
          destroy: [id],
        });
      }
    },
  },
  {
    id: "changes-after-destroy",
    name: "AddressBook/changes reports a destroyed book as destroyed",
    runIf: needsContacts,
    fn: async (ctx) => {
      const set = await ctx.client.call("AddressBook/set", {
        accountId: ctx.contactsAccountId!,
        create: { tmp: { name: "Changes Destroy Book" } },
      });
      const id = (set.created as Record<string, { id: string }>).tmp.id;
      const midState = set.newState as string;
      await ctx.client.call("AddressBook/set", {
        accountId: ctx.contactsAccountId!,
        destroy: [id],
      });
      const changes = await ctx.client.call("AddressBook/changes", {
        accountId: ctx.contactsAccountId!,
        sinceState: midState,
      });
      ctx.assertIncludes(changes.destroyed as string[], id);
    },
  },
  {
    id: "changes-cannot-calculate",
    name: "AddressBook/changes returns cannotCalculateChanges for an unknown state",
    runIf: needsContacts,
    fn: async (ctx) => {
      try {
        await ctx.client.call("AddressBook/changes", {
          accountId: ctx.contactsAccountId!,
          sinceState: "not-a-real-state-000",
        });
        ctx.assert(false, "expected cannotCalculateChanges for an unknown sinceState");
      } catch (err) {
        if (!(err instanceof JmapMethodError)) throw err;
        ctx.assertEqual(err.type, "cannotCalculateChanges");
      }
    },
  },
]);
