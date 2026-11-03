import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL(
  "../../src/components/orders/incoming-orders-desktop-table.tsx",
  import.meta.url,
);

test("the main order table allows native horizontal and vertical touch panning", async () => {
  const source = await readFile(componentPath, "utf8");
  const mainScroller = source.match(
    /data-horizontal-scroll="true"[\s\S]*?className="([^"]+)"/,
  );

  assert.ok(mainScroller, "main table scroller was not found");
  assert.match(mainScroller[1], /touch-auto/);
  assert.doesNotMatch(mainScroller[1], /touch-pan-x/);
});

test("the dedicated bottom scrollbar remains horizontal-only", async () => {
  const source = await readFile(componentPath, "utf8");
  const bottomScroller = source.match(
    /ref=\{stickyScrollRef\}[\s\S]*?className="([^"]+)"/,
  );

  assert.ok(bottomScroller, "bottom horizontal scrollbar was not found");
  assert.match(bottomScroller[1], /touch-pan-x/);
});
