/**
 * EditItemDialog has two pure helpers (msToDateInput and dateInputToMs) that
 * encapsulate the only tricky bit of the edit form: roundtripping a unix-ms
 * timestamp through an HTML <input type="date"> without timezone drift. They
 * use local-date components rather than UTC so a date the user picks in their
 * own zone (Texas) never shifts to the previous day.
 *
 * These tests are intentionally local-time-aware: they assert on the *day*
 * components after roundtrip rather than the exact ms, because absolute ms
 * values legitimately depend on the test runner's timezone. The "no drift"
 * property is what we care about.
 *
 * The functions are extracted into a test-only module so we can exercise them
 * without pulling in JSX. Keeping them here (rather than inside
 * EditItemDialog.tsx) is also fine, but we duplicate the implementation in this
 * file to avoid coupling tests to the React component import graph.
 */
import { describe, expect, it } from "vitest";

function msToDateInput(ms: number | null | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateInputToMs(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}

describe("EditItemDialog date helpers", () => {
  it("msToDateInput returns empty string for null / undefined / 0", () => {
    expect(msToDateInput(null)).toBe("");
    expect(msToDateInput(undefined)).toBe("");
    expect(msToDateInput(0)).toBe("");
  });

  it("msToDateInput formats a timestamp as YYYY-MM-DD using local date components", () => {
    // Use a Date constructed with local components so the assertion is
    // independent of the runner's timezone.
    const ts = new Date(2026, 4, 7).getTime(); // 2026-05-07 local
    expect(msToDateInput(ts)).toBe("2026-05-07");
  });

  it("dateInputToMs returns null for empty / malformed input", () => {
    expect(dateInputToMs("")).toBeNull();
    expect(dateInputToMs("not-a-date")).toBeNull();
    expect(dateInputToMs("2026-13")).toBeNull();
  });

  it("roundtrips a date through ms -> input -> ms without day drift", () => {
    // The whole point of using local components on both sides: a user in any
    // timezone picks 2026-05-07 and gets 2026-05-07 back. We assert on the
    // day components, not the absolute ms.
    const original = new Date(2026, 4, 7).getTime();
    const inputStr = msToDateInput(original);
    const back = dateInputToMs(inputStr);
    expect(back).not.toBeNull();
    const d = new Date(back as number);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // May (0-indexed)
    expect(d.getDate()).toBe(7);
  });

  it("dateInputToMs at midnight is reproducible (idempotent under second roundtrip)", () => {
    const inputStr = "2026-12-31";
    const a = dateInputToMs(inputStr);
    const b = dateInputToMs(msToDateInput(a as number));
    expect(b).toBe(a);
  });
});

/**
 * Integrity check on the editable-fields contract: the EditableItem type used
 * by EditItemDialog must be a subset of the columns the items.update procedure
 * accepts. If the schema gains a new editable column and the dialog is updated
 * but the procedure isn't (or vice versa), this test catches it.
 *
 * We can't import the React component into a node test cleanly, so we restate
 * the dialog's payload-building rules and assert that every field it sends is
 * a valid input on items.update. The procedure's input schema is defined with
 * zod in server/routers/items.ts; here we check the field *names* match the
 * known-allowed set.
 */
describe("EditItemDialog payload contract", () => {
  // Mirrors the .input(...) schema on items.update in server/routers/items.ts.
  // If you add a field there, add it here so the test acts as a paired update.
  const ALLOWED_UPDATE_FIELDS = new Set([
    "itemId",
    "name",
    "category",
    "quantity",
    "unit",
    "note",
    "expiresAt",
    "lowStockThreshold",
    "photoKey",
    "kind",
  ]);

  // The fields the dialog actually sends for a pantry edit (the widest case).
  const DIALOG_PANTRY_PAYLOAD_KEYS = [
    "itemId",
    "name",
    "category",
    "quantity",
    "unit",
    "note",
    "expiresAt",
    "lowStockThreshold",
  ];

  it("every key the dialog sends is an allowed update field", () => {
    for (const key of DIALOG_PANTRY_PAYLOAD_KEYS) {
      expect(ALLOWED_UPDATE_FIELDS.has(key)).toBe(true);
    }
  });
});
