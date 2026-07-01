import type { TestContext } from "../../runner/test-context.js";

/**
 * Assert the mandatory JSContact Card body (RFC 9553 §2.1) — reused across the
 * ContactCard read/query/write chunks. Does not assert optional properties.
 */
export function assertValidCard(ctx: TestContext, card: Record<string, unknown>): void {
  ctx.assertEqual(card["@type"], "Card", "Card @type must be 'Card'");
  ctx.assertType(card.version, "string");
  ctx.assert((card.version as string).length > 0, "Card version must be non-empty");
  ctx.assertType(card.uid, "string");
  ctx.assert((card.uid as string).length > 0, "Card uid must be non-empty");
}

/**
 * Assert ContactCard metadata: id present, addressBookIds a non-empty map whose
 * values are all `true` (RFC 9610 §3).
 */
export function assertValidMembership(ctx: TestContext, card: Record<string, unknown>): void {
  ctx.assertIdValid(card.id as string);
  const abids = card.addressBookIds as Record<string, unknown> | undefined;
  ctx.assertTruthy(abids, "addressBookIds must be present");
  const keys = Object.keys(abids!);
  ctx.assertGreaterThan(keys.length, 0, "a card must belong to at least one address book");
  for (const k of keys) {
    ctx.assertEqual(abids![k], true, `addressBookIds[${k}] must be true`);
  }
}
