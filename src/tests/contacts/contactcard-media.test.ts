import { defineTests } from "../../runner/test-registry.js";
import { needsContacts } from "./_capability.js";
import { buildCard } from "../../setup/seed-contacts.js";
import type { TestContext } from "../../runner/test-context.js";

// RFC 9610 §3 / §3.5 — the JSContact `media` (photo) blob path. The test uploads
// its OWN image and non-image bytes (no dependency on the mail seed). On read a
// photo Media entry MUST carry both blobId and mediaType (§3); a non-image blob
// set as a photo MUST be rejected (§3.5).

// Minimal valid JPEG (JFIF header + EOI).
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);
const NOT_IMAGE = new TextEncoder().encode("this is plainly not an image");

async function mediaCard(ctx: TestContext, blobId: string): Promise<Record<string, unknown>> {
  return {
    ...buildCard({ uid: "urn:example:contacts:media-photo", full: "Photo Contact" }),
    addressBookIds: { [ctx.addressBookIds["bookMain"]]: true },
    media: { m1: { "@type": "Media", kind: "photo", blobId } },
  };
}

defineTests({ rfc: "RFC9610", section: "3.5", category: "contacts" }, [
  {
    id: "media-photo-blobid-roundtrip",
    name: "ContactCard photo round-trips as blobId + mediaType on get",
    runIf: needsContacts,
    fn: async (ctx) => {
      const upload = await ctx.client.upload(JPEG, "image/jpeg", ctx.contactsAccountId!);
      const create = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        create: { c: await mediaCard(ctx, upload.blobId) },
      });
      const id = (create.created as Record<string, { id: string }> | null)?.c?.id;
      ctx.assertTruthy(id, "card with a photo must be created");
      try {
        const get = await ctx.client.call("ContactCard/get", {
          accountId: ctx.contactsAccountId!,
          ids: [id!],
          properties: ["uid", "media"],
        });
        const card = (get.list as Array<Record<string, unknown>>)[0];
        const media = card.media as Record<string, { kind?: string; blobId?: string; mediaType?: string }> | undefined;
        ctx.assertTruthy(media, "media must be present on read");
        const photo = Object.values(media!).find((m) => m.kind === "photo");
        ctx.assertTruthy(photo, "a photo media entry must be returned");
        ctx.assertType(photo!.blobId, "string");
        ctx.assertIdValid(photo!.blobId as string);
        ctx.assertType(photo!.mediaType, "string");
        ctx.assertStringContains(photo!.mediaType as string, "image/");
      } finally {
        await ctx.client.call("ContactCard/set", { accountId: ctx.contactsAccountId!, destroy: [id!] });
      }
    },
  },
  {
    id: "media-photo-download-roundtrip",
    name: "The returned photo blobId downloads to the uploaded bytes",
    runIf: needsContacts,
    fn: async (ctx) => {
      const upload = await ctx.client.upload(JPEG, "image/jpeg", ctx.contactsAccountId!);
      const create = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        create: { c: await mediaCard(ctx, upload.blobId) },
      });
      const id = (create.created as Record<string, { id: string }> | null)?.c?.id;
      ctx.assertTruthy(id, "card with a photo must be created");
      try {
        const get = await ctx.client.call("ContactCard/get", {
          accountId: ctx.contactsAccountId!,
          ids: [id!],
          properties: ["media"],
        });
        const media = (get.list as Array<Record<string, unknown>>)[0].media as Record<string, { kind?: string; blobId?: string }>;
        const photo = Object.values(media).find((m) => m.kind === "photo")!;
        const dl = await ctx.client.download(photo.blobId as string, "image/jpeg", "photo.jpg", ctx.contactsAccountId!);
        ctx.assert(dl.status >= 200 && dl.status < 300, `download must succeed, got ${dl.status}`);
        ctx.assertEqual(dl.body.byteLength, JPEG.byteLength, "downloaded photo size must match the upload");
      } finally {
        await ctx.client.call("ContactCard/set", { accountId: ctx.contactsAccountId!, destroy: [id!] });
      }
    },
  },
  {
    id: "media-photo-non-image-rejected",
    name: "ContactCard/set MUST reject a non-image blob as a photo (RFC 9610 §3.5)",
    runIf: needsContacts,
    fn: async (ctx) => {
      const upload = await ctx.client.upload(NOT_IMAGE, "text/plain", ctx.contactsAccountId!);
      const res = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        create: {
          c: {
            ...buildCard({ uid: "urn:example:contacts:media-notimage" }),
            addressBookIds: { [ctx.addressBookIds["bookMain"]]: true },
            media: { m1: { "@type": "Media", kind: "photo", blobId: upload.blobId } },
          },
        },
      });
      const notCreated = res.notCreated as Record<string, { type: string }> | null;
      ctx.assertTruthy(notCreated?.c, "a non-image blob set as a photo must be rejected (RFC 9610 §3.5 MUST)");
      // Clean up if the server erroneously accepted it.
      const created = res.created as Record<string, { id: string }> | null;
      if (created?.c) {
        await ctx.client.call("ContactCard/set", { accountId: ctx.contactsAccountId!, destroy: [created.c.id] });
      }
    },
  },
]);
