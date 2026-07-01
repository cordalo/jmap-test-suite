import { defineTests } from "../../runner/test-registry.js";
import { JmapMethodError } from "../../client/jmap-client.js";
import { needsContacts } from "./_capability.js";
import { buildCard } from "../../setup/seed-contacts.js";
import type { TestContext } from "../../runner/test-context.js";

// RFC 9610 §3.2 ContactCard/changes (standard /changes, RFC 8620 §5.2).

async function currentState(ctx: TestContext): Promise<string> {
  const get = await ctx.client.call("ContactCard/get", {
    accountId: ctx.contactsAccountId!,
    ids: [],
  });
  return get.state as string;
}

async function createCard(ctx: TestContext, uid: string): Promise<string> {
  const res = await ctx.client.call("ContactCard/set", {
    accountId: ctx.contactsAccountId!,
    create: {
      c: { ...buildCard({ uid }), addressBookIds: { [ctx.addressBookIds["bookMain"]]: true } },
    },
  });
  return (res.created as Record<string, { id: string }>).c.id;
}

defineTests({ rfc: "RFC9610", section: "3.2", category: "contacts" }, [
  {
    id: "changes-response-structure",
    name: "ContactCard/changes response has all required properties",
    runIf: needsContacts,
    fn: async (ctx) => {
      const state = await currentState(ctx);
      const result = await ctx.client.call("ContactCard/changes", {
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
    name: "ContactCard/changes with the current state returns empty deltas",
    runIf: needsContacts,
    fn: async (ctx) => {
      const state = await currentState(ctx);
      const result = await ctx.client.call("ContactCard/changes", {
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
    name: "ContactCard/changes reports a newly created card as created",
    runIf: needsContacts,
    fn: async (ctx) => {
      const oldState = await currentState(ctx);
      const id = await createCard(ctx, "urn:example:contacts:changes-create");
      try {
        const changes = await ctx.client.call("ContactCard/changes", {
          accountId: ctx.contactsAccountId!,
          sinceState: oldState,
        });
        ctx.assertIncludes(changes.created as string[], id);
      } finally {
        await ctx.client.call("ContactCard/set", {
          accountId: ctx.contactsAccountId!,
          destroy: [id],
        });
      }
    },
  },
  {
    id: "changes-after-update",
    name: "ContactCard/changes reports an updated card as updated",
    runIf: needsContacts,
    fn: async (ctx) => {
      const id = await createCard(ctx, "urn:example:contacts:changes-update");
      // Capture state AFTER create so only the update shows.
      const midState = await currentState(ctx);
      try {
        await ctx.client.call("ContactCard/set", {
          accountId: ctx.contactsAccountId!,
          update: { [id]: { "name/full": "Updated Name" } },
        });
        const changes = await ctx.client.call("ContactCard/changes", {
          accountId: ctx.contactsAccountId!,
          sinceState: midState,
        });
        ctx.assertIncludes(changes.updated as string[], id);
      } finally {
        await ctx.client.call("ContactCard/set", {
          accountId: ctx.contactsAccountId!,
          destroy: [id],
        });
      }
    },
  },
  {
    id: "changes-after-destroy",
    name: "ContactCard/changes reports a destroyed card as destroyed",
    runIf: needsContacts,
    fn: async (ctx) => {
      const id = await createCard(ctx, "urn:example:contacts:changes-destroy");
      const midState = await currentState(ctx);
      await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        destroy: [id],
      });
      const changes = await ctx.client.call("ContactCard/changes", {
        accountId: ctx.contactsAccountId!,
        sinceState: midState,
      });
      ctx.assertIncludes(changes.destroyed as string[], id);
    },
  },
  {
    id: "changes-created-then-destroyed-omitted",
    name: "A card created and destroyed within the window appears in no bucket (RFC 8620 §5.2)",
    runIf: needsContacts,
    fn: async (ctx) => {
      const oldState = await currentState(ctx);
      const id = await createCard(ctx, "urn:example:contacts:changes-ephemeral");
      await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        destroy: [id],
      });
      const changes = await ctx.client.call("ContactCard/changes", {
        accountId: ctx.contactsAccountId!,
        sinceState: oldState,
      });
      ctx.assertNotIncludes(changes.created as string[], id);
      ctx.assertNotIncludes(changes.updated as string[], id);
      ctx.assertNotIncludes(changes.destroyed as string[], id);
    },
  },
  {
    id: "changes-cannot-calculate",
    name: "ContactCard/changes returns cannotCalculateChanges for an unknown state",
    runIf: needsContacts,
    fn: async (ctx) => {
      try {
        await ctx.client.call("ContactCard/changes", {
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
