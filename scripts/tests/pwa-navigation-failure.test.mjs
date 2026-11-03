import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync("public/sw.js", "utf8");

function worker(fetchResponse) {
  const listeners = {};
  const logs = [];
  vm.runInNewContext(source, {
    self: {
      location: { origin: "https://example.com" },
      navigator: { onLine: true, userAgent: "Test browser" },
      addEventListener: (name, handler) => { listeners[name] = handler; },
    },
    navigator: { onLine: true, userAgent: "Test browser" },
    caches: { match: async () => new Response("OLD OFFLINE PAGE") },
    fetch: fetchResponse,
    Response,
    URL,
    console: { error: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  });
  return {
    logs,
    navigate(preloadResponse = Promise.resolve(undefined)) {
      let response;
      listeners.fetch({
        request: {
          url: "https://example.com/login?token=PRIVATE",
          method: "GET",
          mode: "navigate",
          headers: new Headers(),
        },
        preloadResponse,
        respondWith: (value) => { response = value; },
      });
      return response;
    },
  };
}

test("failed navigation exposes safe diagnostics instead of the cached offline page", async () => {
  const sw = worker(async () => { throw new TypeError("Network <failure>"); });
  const response = await sw.navigate();
  assert.equal(response.status, 503);
  const html = await response.text();
  assert.match(html, /Network &lt;failure&gt;/);
  assert.match(html, /href="\/login"/);
  assert.doesNotMatch(html, /OLD OFFLINE PAGE|PRIVATE|<script/);
  assert.ok(sw.logs.length > 0);
  assert.doesNotMatch(JSON.stringify(sw.logs), /PRIVATE/);
});

test("failed navigation preload is logged and retried using the network", async () => {
  const sw = worker(async () => new Response("LOGIN"));
  const response = await sw.navigate(Promise.reject(new TypeError("Preload failed")));
  assert.equal(await response.text(), "LOGIN");
  assert.ok(sw.logs.length > 0);
});

test("HTTP server failures remain server responses rather than becoming offline pages", async () => {
  const sw = worker(async () => new Response("SERVER ERROR", { status: 500 }));
  const response = await sw.navigate();
  assert.equal(response.status, 500);
  assert.equal(await response.text(), "SERVER ERROR");
  assert.ok(sw.logs.length > 0);
});
