/**
 * Responsive layout regression tests
 *
 * Locks in three layout fixes that came out of an iPhone PWA bug report:
 *
 *   1. AppShell header MUST be full-bleed (`w-full`) so on phone widths the
 *      glass background spans the whole viewport edge-to-edge. Previously the
 *      header lived inside `.container`, which on certain viewport widths
 *      revealed a vertical seam between the cream header and the body's
 *      peach gradient.
 *
 *   2. The staple "Add to list" pill MUST collapse to icon-only on phone
 *      (< 640 px) and expand to icon + label on tablet/fridge (>= 640 px).
 *      Otherwise long item names like "Bunny Grahams Chocolate" force the
 *      row to wrap, pushing the action cluster awkwardly below the title.
 *
 *   3. The action cluster MUST use `shrink-0` and a tighter `gap-0.5` on
 *      phone so the title region keeps its allotted horizontal space.
 *
 * Source-level assertions are intentional: these are layout invariants that
 * unit-rendering tests can't easily verify without booting jsdom + Tailwind,
 * so we lock the Tailwind class strings instead.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const APPSHELL = readFileSync(resolve(ROOT, "client/src/components/AppShell.tsx"), "utf8");
const ITEMROW = readFileSync(resolve(ROOT, "client/src/components/ItemRow.tsx"), "utf8");

describe("responsive layout: AppShell header is full-bleed", () => {
  it("uses w-full on the sticky header element", () => {
    // The header MUST carry w-full so its glass background paints
    // edge-to-edge regardless of the inner container's max-width.
    const headerOpen = APPSHELL.match(/<header\b[^>]*className=\{?"([^"]+)"/);
    expect(headerOpen, "could not locate AppShell <header> element").not.toBeNull();
    expect(headerOpen![1]).toMatch(/\bw-full\b/);
    expect(headerOpen![1]).toMatch(/\bsticky\b/);
    expect(headerOpen![1]).toMatch(/\bglass-strong\b/);
  });

  it("wraps the inner row in .container so content stays aligned with body", () => {
    // The header markup is: <header class="...w-full..."><div class="container ..."> ...
    // This pattern decouples background bleed from content alignment.
    expect(APPSHELL).toMatch(/<header\b[\s\S]*?<div\s+className="container\s+flex/);
  });

  it("preserves env(safe-area-inset-top) padding on the header", () => {
    // iOS PWAs: the system status bar sits in the safe-area-inset-top region.
    // We MUST keep this inline style or the iPhone clock overlaps the wordmark.
    expect(APPSHELL).toMatch(/paddingTop:\s*"env\(safe-area-inset-top\)"/);
  });
});

describe("responsive layout: staple Add-to-list pill collapses on phone", () => {
  it("renders the icon + label, hiding the label below the sm breakpoint", () => {
    // The label MUST be wrapped in a span with `hidden sm:inline` (or always
    // `inline` when the `large` kiosk variant is active) so phone rows show
    // the icon only.
    const labelMatch = ITEMROW.match(
      /className=\{large \? "inline" : "hidden sm:inline"\}\s*>Add to list</,
    );
    expect(labelMatch, "Add-to-list label must be hidden on phone via hidden sm:inline").not.toBeNull();
  });

  it("uses tighter px-2 on phone, px-3 on tablet+ for the pill", () => {
    // The pill MUST shrink its horizontal padding on phone so it doesn't crowd
    // long item names; the larger px-3 returns at the sm breakpoint.
    expect(ITEMROW).toMatch(/className="gap-1\.5 mr-1 px-2 sm:px-3"/);
  });

  it("keeps the aria-label populated regardless of label visibility", () => {
    // Hiding the visible label MUST NOT regress accessibility.
    expect(ITEMROW).toMatch(/aria-label=\{`Add \$\{item\.name\} to shopping list`\}/);
  });
});

describe("responsive layout: action cluster keeps title space on phone", () => {
  it("uses shrink-0 + responsive gap on the action cluster wrapper", () => {
    // The cluster MUST be shrink-0 so flex doesn't squeeze the icon row when
    // an item name pushes against it. gap-0.5 on phone, gap-1 on sm+.
    expect(ITEMROW).toMatch(/<div className="flex items-center gap-0\.5 sm:gap-1 shrink-0">/);
  });
});

describe("responsive layout: long item names wrap instead of clipping", () => {
  it("uses line-clamp-2 + break-words on the title so long names wrap to 2 lines", () => {
    // The earlier `truncate` would clip mid-word at narrow widths, hiding the
    // tail of names like "Bunny Grahams Chocolate". line-clamp-2 wraps to a
    // second line and ellipsizes only beyond that, so the row stays bounded
    // in height while preserving readability on iPhone SE-class widths.
    expect(ITEMROW).toMatch(/"line-clamp-2"/);
    expect(ITEMROW).toMatch(/break-words/);
  });

  it("does not regress to single-line truncate on the title element", () => {
    // Guard: a future refactor switching back to `truncate` on the title
    // wrapper would silently re-introduce the iPhone clip bug.
    const titleBlock = ITEMROW.match(
      /font-medium leading-snug break-words[\s\S]{0,200}line-clamp-2[\s\S]{0,400}\{item\.name\}/,
    );
    expect(titleBlock, "title wrapper must keep its leading-snug + line-clamp-2 combination").not.toBeNull();
  });
});
