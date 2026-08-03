import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const dashboard = await readFile(
  new URL("../public/dashboard.html", import.meta.url),
  "utf8",
);

async function renderRoot() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const env = {
    ASSETS: { fetch: async (request) => new URL(request.url).pathname === "/dashboard.html"
      ? new Response(dashboard, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })
      : new Response("Not found", { status: 404 }) },
  };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  let response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, ctx);
  if(response.status>=300&&response.status<400&&response.headers.get("location")) {
    response = await worker.fetch(new Request(new URL(response.headers.get("location"), "http://localhost/"), { headers: { accept: "text/html" } }), env, ctx);
  }
  return response;
}

function moderationHarness({ reports = [], flags = [], invoke } = {}) {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) {
      elements.set(selector, {
        checked: false,
        classList: { add() {}, remove() {} },
        addEventListener() {},
        innerHTML: "",
        selectedIndex: 0,
        textContent: "",
        value: "",
      });
    }
    return elements.get(selector);
  };
  element("#openOnly").checked = true;
  element("#flagOpenOnly").checked = true;

  const calls = { confirms: [], invokes: [], refreshes: [], rpcs: [], toasts: [] };
  const context = {
    console,
    URL,
    SUPABASE_URL: "https://unikkvliogducvvswlbv.supabase.co",
    confirm(message) { calls.confirms.push(message); return true; },
    esc(value) {
      return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      })[character]);
    },
    fmtDate: (value) => String(value ?? ""),
    loadOverview: () => calls.refreshes.push("overview"),
    openModerateAny() {},
    rpc: async (name, body) => {
      calls.rpcs.push({ name, body });
      return name === "admin_list_reports" ? reports : name === "admin_list_flags" ? flags : undefined;
    },
    sb: { functions: { invoke: async (name, options) => {
      calls.invokes.push({ name, ...options });
      return invoke ? invoke(name, options) : { data: { ok: true }, error: null };
    } } },
    toast: (message) => calls.toasts.push(message),
    window: {},
    $: element,
  };
  context.window = context;

  const start = dashboard.indexOf("// ---- reports ----");
  const end = dashboard.indexOf("// ---- cases:");
  assert.ok(start > 0 && end > start, "moderation script sections exist");
  vm.runInNewContext(dashboard.slice(start, end), context);

  return { calls, context, element };
}

test("server-rendered admin route remains healthy", async () => {
  const response = await renderRoot();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(await response.text(), /<html|<!doctype html>/i);
});

const flag = {
  id: "11111111-1111-4111-8111-111111111111",
  source_table: "posts",
  author_id: "22222222-2222-4222-8222-222222222222",
  author_name: '<img src=x onerror="steal()">',
  excerpt: "<script>steal()</script>",
  categories: ['harassment" onclick="steal()'],
  check_status: "confirmed",
  content_moderation_state: "quarantined",
  status: "open",
};

test("renders open moderation flags as quarantined with explicit safe decisions", async () => {
  const h = moderationHarness({ flags: [flag] });
  await h.context.loadFlags();
  const html = h.element("#flagsBody").innerHTML;

  assert.match(html, />Quarantined</);
  assert.match(html, />Approve</);
  assert.match(html, />Remove \+ warn</);
  assert.doesNotMatch(html, />Dismiss<|>Handled</);
  assert.doesNotMatch(html, /<script>steal\(\)<\/script>|onclick="steal\(\)/);
  assert.doesNotMatch(html, new RegExp(flag.id));
});

test("only renders moderation media links for exact trusted HTTPS hosts", async () => {
  const hostile = [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://unikkvliogducvvswlbv.supabase.co/file.jpg",
    "//unikkvliogducvvswlbv.supabase.co/file.jpg",
    "https://evil.example/file.jpg",
    "https://unikkvliogducvvswlbv.supabase.co@evil.example/file.jpg",
    "not a url",
  ];
  for (const image_url of hostile) {
    const h = moderationHarness({ flags: [{ ...flag, image_url }] });
    await h.context.loadFlags();
    assert.doesNotMatch(h.element("#flagsBody").innerHTML, /<a\b/i, image_url);
  }

  const signed = "https://unikkvliogducvvswlbv.supabase.co/storage/v1/object/sign/proofs/a.jpg?token=a%26b";
  const h = moderationHarness({ flags: [{ ...flag, image_url: signed }] });
  await h.context.loadFlags();
  assert.match(h.element("#flagsBody").innerHTML, /<a href="https:\/\/unikkvliogducvvswlbv\.supabase\.co\/storage\/v1\/object\/sign\/proofs\/a\.jpg\?token=a%26b"/);
});

test("only confirmed quarantined flags get quarantine labels and actions", async () => {
  const rows = [
    flag,
    ...["safe", "uncertain", "error"].map((check_status, index) => ({
      ...flag,
      id: `55555555-5555-4555-8555-55555555555${index}`,
      check_status,
      content_moderation_state: "visible",
    })),
    { ...flag, id: "66666666-6666-4666-8666-666666666666", check_status: "safe" },
  ];
  const h = moderationHarness({ flags: rows });
  await h.context.loadFlags();
  const html = h.element("#flagsBody").innerHTML;

  assert.equal((html.match(/>Quarantined</g) ?? []).length, 1);
  assert.equal((html.match(/>Approve</g) ?? []).length, 1);
  assert.equal((html.match(/>Visible pending review</g) ?? []).length, 4);
  assert.equal((html.match(/>Allow</g) ?? []).length, 4);
  assert.equal((html.match(/>Remove \+ warn</g) ?? []).length, 5);
});

test("approval confirms, locks duplicate requests, invokes the action, and refreshes all moderation views", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const h = moderationHarness({ flags: [flag], invoke: () => pending });
  await h.context.loadFlags();
  h.context.loadFlags = () => h.calls.refreshes.push("flags");
  h.context.loadReports = () => h.calls.refreshes.push("reports");
  const button = { disabled: false, textContent: "Approve" };

  const first = h.context.approveFlag(0, button);
  const duplicate = h.context.approveFlag(0, button);
  assert.equal(button.disabled, true);
  assert.equal(h.calls.confirms.length, 1);
  assert.equal(h.calls.invokes.length, 1);
  assert.equal(h.calls.invokes[0].body.action, "approve_content");
  assert.equal(h.calls.invokes[0].body.flag_id, flag.id);

  release({ data: { ok: true }, error: null });
  await Promise.all([first, duplicate]);
  assert.equal(button.disabled, false);
  assert.deepEqual(h.calls.refreshes.sort(), ["flags", "overview", "reports"]);
});

test("approval presents a safe message when the server rejects the request", async () => {
  const h = moderationHarness({
    flags: [flag],
    invoke: async () => ({ data: null, error: { message: "request failed", stack: "secret stack" } }),
  });
  await h.context.loadFlags();
  await h.context.approveFlag(0, { disabled: false, textContent: "Approve" });

  assert.equal(h.calls.toasts.at(-1), "Could not approve this content. Refresh and try again.");
  assert.doesNotMatch(h.calls.toasts.join(" "), /secret stack|request failed/);
});

test("structured manual reports stay open for human review and show AI context", async () => {
  const outcomes = ["safe", "uncertain", "error"];
  const reports = outcomes.map((outcome, index) => ({
    id: `33333333-3333-4333-8333-33333333333${index}`,
    reason: `Reported a post: "review me" (post 44444444-4444-4444-8444-444444444444)`,
    source_table: "posts",
    source_id: "44444444-4444-4444-8444-444444444444",
    ai_check_status: outcome,
    ai_categories: index === 0 ? ["<img src=x onerror=steal()>"] : ["classifier context"],
    ai_max_score: index / 10,
    content_moderation_state: "visible",
    resolved_at: null,
  }));
  const h = moderationHarness({ reports });
  await h.context.loadReports();
  const html = h.element("#reportsBody").innerHTML;

  assert.equal((html.match(/Visible pending review/g) ?? []).length, 3);
  assert.equal((html.match(/>Allow</g) ?? []).length, 3);
  assert.equal((html.match(/>Remove post \+ warn</g) ?? []).length, 3);
  for (const outcome of outcomes) assert.match(html, new RegExp(`AI: ${outcome}`, "i"));
  assert.doesNotMatch(html, /<img src=x|onclick=steal/);
  assert.equal(h.calls.invokes.length, 0, "rendering never auto-closes an AI-safe report");
});

test("quarantined structured report approval uses the linked flag action and refreshes moderation views", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const report = {
    id: "77777777-7777-4777-8777-777777777777",
    source_table: "posts",
    source_id: "88888888-8888-4888-8888-888888888888",
    ai_flag_id: "99999999-9999-4999-8999-999999999999",
    ai_check_status: "confirmed",
    content_moderation_state: "quarantined",
    reason: "Needs review",
    resolved_at: null,
  };
  const h = moderationHarness({ reports: [report], invoke: () => pending });
  await h.context.loadReports();
  assert.match(h.element("#reportsBody").innerHTML, /approveReport\(0,this\).*?>Approve</);
  h.context.loadFlags = () => h.calls.refreshes.push("flags");
  h.context.loadReports = () => h.calls.refreshes.push("reports");
  const button = { disabled: false, textContent: "Approve" };

  const first = h.context.approveReport(0, button);
  const duplicate = h.context.approveReport(0, button);
  assert.equal(button.disabled, true);
  assert.equal(h.calls.confirms.length, 1);
  assert.equal(h.calls.invokes.length, 1);
  assert.equal(h.calls.invokes[0].body.action, "approve_content");
  assert.equal(h.calls.invokes[0].body.flag_id, report.ai_flag_id);
  release({ data: { ok: true }, error: null });
  await Promise.all([first, duplicate]);
  assert.deepEqual(h.calls.refreshes.sort(), ["flags", "overview", "reports"]);
});

test("visible structured report Allow continues to use report resolution RPC", async () => {
  const report = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    source_table: "posts",
    source_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ai_check_status: "safe",
    content_moderation_state: "visible",
    reason: "Visible report",
    resolved_at: null,
  };
  const h = moderationHarness({ reports: [report] });
  await h.context.loadReports();
  await h.context.resolveReport(0, true);
  const mutation = h.calls.rpcs.find(({ name }) => name === "admin_resolve_report");
  assert.deepEqual({ ...mutation.body }, { p_report: report.id, p_resolve: true });
  assert.equal(h.calls.invokes.length, 0);
});

test("quarantined report without a valid linked flag cannot misleadingly allow content", async () => {
  const h = moderationHarness({ reports: [{
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    source_table: "posts",
    source_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    ai_flag_id: "not-a-uuid",
    ai_check_status: "confirmed",
    content_moderation_state: "quarantined",
    reason: "Missing flag",
    resolved_at: null,
  }] });
  await h.context.loadReports();
  const html = h.element("#reportsBody").innerHTML;
  assert.match(html, /Needs linked flag review/);
  assert.doesNotMatch(html, />Allow<|>Approve</);
});
