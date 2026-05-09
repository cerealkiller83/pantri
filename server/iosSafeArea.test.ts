import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * iOS PWA notch handling.
 *
 * On iPhone home-screen installs the system status bar (time, signal,
 * battery, notification icons) used to overlap Pantri's sticky header
 * because the app declared `apple-mobile-web-app-status-bar-style` as
 * `black-translucent` (which lets iOS draw the system bar over content)
 * and the header had no `env(safe-area-inset-top)` padding to compensate.
 *
 * This test is a regression guard: it checks (a) the index.html declares
 * the `default` status-bar style and the cover-fitting viewport, and
 * (b) the headers/main containers that wrap app content all opt into
 * env(safe-area-inset-*) padding, so a future refactor can't silently
 * re-introduce the notch overlap.
 *
 * It reads the source files as plain text — no React render needed — so
 * it stays cheap and works without a DOM in CI.
 */

const root = resolve(__dirname, "..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("ios pwa safe-area", () => {
  it("declares the cover-fitting viewport and non-translucent status bar", () => {
    const html = read("client/index.html");

    // viewport-fit=cover is required for env(safe-area-inset-*) to resolve
    // to the real notch offsets on iOS — without it they all become 0px.
    expect(html).toMatch(/viewport-fit=cover/);

    // black-translucent caused the original overlap. We deliberately moved
    // to "default" so iOS reserves space for its system bar above app
    // content; if anyone flips this back, this test should fail loudly.
    expect(html).toMatch(
      /apple-mobile-web-app-status-bar-style"\s+content="default"/
    );
    expect(html).not.toMatch(
      /apple-mobile-web-app-status-bar-style"\s+content="black-translucent"/
    );
  });

  it("AppShell sticky header pads top by safe-area-inset-top", () => {
    const src = read("client/src/components/AppShell.tsx");
    // The actual rule must be present inside the sticky header element.
    expect(src).toMatch(/sticky top-0[\s\S]*?env\(safe-area-inset-top\)/);
    // Bottom inset is also handled so the iPhone home indicator does not
    // overlap list rows / floating actions.
    expect(src).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it("standalone-page headers (Home, NewHousehold, JoinHousehold, Kiosk) all opt into safe-area-inset-top", () => {
    const files = [
      "client/src/pages/Home.tsx",
      "client/src/pages/NewHousehold.tsx",
      "client/src/pages/JoinHousehold.tsx",
      "client/src/pages/Kiosk.tsx",
    ];
    for (const f of files) {
      const src = read(f);
      // Each of these pages renders its own top header outside AppShell, so
      // each must independently pad for the iOS status bar.
      expect(
        src.includes("env(safe-area-inset-top)"),
        `${f} is missing env(safe-area-inset-top) padding on its top container`
      ).toBe(true);
    }
  });
});
