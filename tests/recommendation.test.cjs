/* Run: node tests/recommendation.test.cjs (no dependencies). */
function runTests(engine, source, report = () => {}) {
  let passed = 0;
  const eq = (actual, expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const test = (name, fn) => { fn(); passed++; report(`PASS ${name}`); };
  const task = (id, changes = {}) => ({ id, title: id, deadline: "", size: "normal", priority: "medium", progress: 0, completed: false, ...changes });
  const now = new Date(2026, 10, 1, 12);
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const helpers = source.slice(source.indexOf("const WORK_DAYS ="), source.indexOf("/* ===== タスクカード作成"));
  function api(tasks) {
    return new Function("TaskFlowRecommendation", "tasks", "Date", helpers + ";return {calculatePriorityScore,calculateStartDate,calculateRemainingDays,sortByRecommendation};")(engine, tasks, FixedDate);
  }
  function categorize(tasks, visible = tasks) {
    const functions = api(tasks);
    return engine.categorize(tasks, visible, now, functions.calculateStartDate, functions.sortByRecommendation);
  }
  const ids = list => list.map(item => item.id);
  test("today deadline overrides future manual plan", () => eq(ids(categorize([task("a", { deadline: "2026-11-01", plannedDate: "2026-11-10" })]).today), ["a"]));
  test("overdue overrides future manual plan", () => eq(ids(categorize([task("a", { deadline: "2026-10-31", plannedDate: "2026-11-10" })]).today), ["a"]));
  test("future deadline respects manual plan", () => eq(categorize([task("a", { deadline: "2026-11-20", plannedDate: "2026-11-10" })]).today.length, 0));
  test("uncompleted child blocks parent recommendation", () => {
    const p = task("p", { deadline: "2026-11-01" }); const c = task("c", { parentId: "p" });
    eq(ids(categorize([p, c]).today), ["c"]);
  });
  test("child outside visible category still blocks parent", () => {
    const p = task("p", { deadline: "2026-11-01", category: "work" }); const c = task("c", { parentId: "p", category: "life" });
    eq(categorize([p, c], [p]).today, []);
  });
  test("all children completed allows parent", () => {
    eq(ids(categorize([task("p", { deadline: "2026-11-01" }), task("c", { parentId: "p", completed: true })]).today), ["p"]);
  });
  test("blocked 100 percent parent is not confirmation", () => {
    const p = task("p", { progress: 100 }); const c = task("c", { parentId: "p" });
    eq(engine.state(p, [p, c]), "blocked"); eq(categorize([p, c]).confirmations, []);
  });
  test("own deadline overrides parent", () => {
    const p = task("p", { deadline: "2026-11-01" }); const c = task("c", { deadline: "2026-11-20", parentId: "p" });
    eq(engine.effectiveDeadline(c, [p, c]), "2026-11-20"); eq(engine.bucket(c, [p, c], now), "later");
  });
  test("no own deadline inherits parent without mutation", () => {
    const p = task("p", { deadline: "2026-11-01" }); const c = task("c", { parentId: "p" });
    const before = JSON.stringify([p, c]); categorize([p, c]); eq(engine.effectiveDeadline(c, [p, c]), "2026-11-01"); eq(JSON.stringify([p, c]), before);
  });
  test("parent change reflected immediately", () => {
    const p = task("p", { deadline: "2026-11-01" }); const c = task("c", { parentId: "p" });
    p.deadline = "2026-11-20"; eq(engine.effectiveDeadline(c, [p, c]), "2026-11-20");
  });
  test("missing/deleted parent means no inherited deadline", () => eq(engine.effectiveDeadline(task("c", { parentId: "missing" }), []), ""));
  test("inherited deadline agrees in score/start/graph", () => {
    const p = task("p", { deadline: "2026-11-08" }); const c = task("c", { parentId: "p" }); const own = task("own", { deadline: p.deadline });
    const f = api([p, c, own]); eq(f.calculatePriorityScore(c), f.calculatePriorityScore(own)); eq(f.calculateStartDate(c), "2026-11-05"); eq(engine.bucket(c, [p, c], now), "later");
  });
  for (const changes of [{}, { deadline: "2026-11-01" }, { deadline: "2026-12-01" }, { plannedDate: "2026-12-01" }]) {
    test(`100 percent confirmation ${JSON.stringify(changes)}`, () => {
      const result = categorize([task("a", { ...changes, progress: 100 })]); eq(ids(result.confirmations), ["a"]); eq(result.today, []); eq(result.suggestions, []); eq(result.tomorrow, []);
    });
  }
  test("completed tasks excluded everywhere", () => {
    const r = categorize([task("a", { completed: true, progress: 100 })]); eq(Object.values(r).flat(), []);
  });
  test("confirmation excluded from work recommendation but remains deadline bucket", () => {
    const a = task("a", { progress: 100, deadline: "2026-11-01" }); eq(engine.bucket(a, [a], now), "today"); eq(engine.state(a, [a]), "confirmation");
  });
  test("confirmation does not consume work suggestion slot", () => {
    const r = categorize([task("confirm", { progress: 100 }), task("a"), task("b"), task("c"), task("d")]); eq(r.confirmations.length, 1); eq(r.suggestions.length, 3);
  });
  test("migration to tomorrow and undo keep own deadline", () => {
    const a = task("a", { deadline: "2026-11-08", plannedDate: "2026-11-02", migrationCount: 1 });
    eq(ids(categorize([a]).tomorrow), ["a"]); a.plannedDate = null; eq(categorize([a]).today, []); eq(a.deadline, "2026-11-08");
  });
  test("unchanged baseline scores", () => {
    const f = api([]); eq(f.calculatePriorityScore(task("a")), 36);
    eq(f.calculatePriorityScore(task("b", { deadline: "2026-11-02", priority: "low", size: "short" })), 63);
    eq(f.calculatePriorityScore(task("c", { deadline: "2026-11-15", priority: "high", size: "veryLong" })), 75);
  });
  test("work scale and progress conversion unchanged", () => {
    const f = api([]); eq(["short", "normal", "long", "veryLong"].map(size => f.calculateRemainingDays(task(size, { size }))), [1, 2, 4, 7]);
    eq(f.calculateRemainingDays(task("a", { progress: 50 })), 1); eq(f.calculateRemainingDays(task("b", { size: "short", progress: 90 })), 1);
  });
  test("legacy optional fields and JSON roundtrip", () => {
    const data = [task("p", { deadline: "2026-11-01" }), task("c", { parentId: "p" })];
    const restored = JSON.parse(JSON.stringify({ app: "TaskFlow", version: 1, tasks: data })).tasks;
    eq(ids(categorize(restored).today), ["c"]); eq(restored[1].deadline, "");
  });
  test("recommendation order puts work before confirmation and blocked parent", () => {
    const p = task("p", { deadline: "2026-11-01", priority: "high" });
    const c = task("c", { parentId: "p", deadline: "2026-12-01", priority: "low" });
    const confirm = task("confirm", { progress: 100 });
    eq(ids(api([p, c, confirm]).sortByRecommendation([p, confirm, c])), ["c", "confirm", "p"]);
  });
  test("confirmation returns to work after progress correction", () => {
    const a = task("a", { progress: 100 }); a.progress = 90;
    eq(engine.state(a, [a]), "work"); eq(ids(categorize([a]).suggestions), ["a"]);
  });
  test("completed confirmation disappears and undo restores confirmation", () => {
    const a = task("a", { progress: 100, completed: true });
    eq(categorize([a]).confirmations.length, 0); a.completed = false;
    eq(ids(categorize([a]).confirmations), ["a"]);
  });
  test("independent 100 percent parent with completed children needs confirmation", () => {
    const p = task("p", { progress: 100 }); const c = task("c", { parentId: "p", completed: true });
    eq(ids(categorize([p, c]).confirmations), ["p"]);
  });
  test("Sunday tomorrow and next-week boundaries", () => {
    eq(engine.bucket(task("a", { deadline: "2026-11-02" }), [], now), "tomorrow"); eq(engine.bucket(task("b", { deadline: "2026-11-03" }), [], now), "later");
  });
  report(`${passed} tests passed`);
  return passed;
}
module.exports = runTests;
if (typeof require !== "undefined" && require.main === module) {
  const fs = require("node:fs");
  const path = require("node:path");
  runTests(require("../recommendation.js"), fs.readFileSync(path.join(__dirname, "../script.js"), "utf8"), console.log);
}
