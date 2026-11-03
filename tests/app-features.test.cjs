/* Dependency-free regression tests. Run: node tests/app-features.test.cjs */
function runTests(engine, source, pwaSource, report = () => {}) {
  let passed = 0;
  const failures = [];
  const check = (value, message) => { if (!value) throw new Error(message); };
  const test = (name, fn) => { try { fn(); passed++; report(`PASS ${name}`); } catch (error) { failures.push(name); report(`FAIL ${name}: ${error.message}`); } };
  const task = (id, extra = {}) => ({ id, title: id, deadline: "", size: "normal", priority: "medium", progress: 0, completed: false, ...extra });
  function app(data = [], options = {}) {
    const nodes = new Map();
    const documentEvents = {};
    const storage = options.storage || new Map([["tasks", JSON.stringify(data)]]);
    let fail = false;
    const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
    function element(tag = "div") {
      const events = {};
      const node = {
        tagName: tag.toUpperCase(), children: [], dataset: {}, style: {}, attributes: {}, value: "", hidden: false, checked: false, open: false, isConnected: true,
        set innerHTML(value) { this.children = []; },
        get selectedIndex() { return this.children.findIndex(child => child.value === this.value); },
        addEventListener(type, fn) { (events[type] ||= []).push(fn); },
        dispatch(type, event = {}) { for (const fn of events[type] || []) fn({ target: node, ...event }); },
        setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; },
        appendChild(child) { child.parentElement = node; node.children.push(child); return child; },
        prepend(child) { child.parentElement = node; node.children.unshift(child); },
        contains(child) { return descendants(node).includes(child); },
        querySelectorAll(selector) { return selector === "[data-task-id]" ? descendants(node).filter(child => child.dataset.taskId) : descendants(node).filter(child => ["INPUT", "SELECT", "BUTTON"].includes(child.tagName)); },
        querySelector(selector) { return selector === "summary" ? descendants(node).find(child => child.tagName === "SUMMARY") || null : null; },
        focus() { document.activeElement = node; }, scrollIntoView() {}, showModal() { node.open = true; }, close() { node.open = false; },
        setCustomValidity() {}, reportValidity() {}, remove() {}, click() { node.dispatch("click"); },
      };
      const classes = new Set();
      node.classList = { add: name => classes.add(name), remove: name => classes.delete(name), toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } };
      return node;
    }
    const document = {
      activeElement: null,
      getElementById(id) {
        if (!nodes.has(id)) {
          const node = element(["usageGuide", "privacyGuide", "addTaskAdvanced"].includes(id) ? "details" : "div");
          if (["usageGuide", "privacyGuide"].includes(id)) node.appendChild(element("summary"));
          node.hidden = ["editModal", "installHint", "completionUndo"].includes(id);
          node.value = ({ priorityInput: "medium", sizeInput: "normal", taskFilter: "all", taskSort: "deadline" })[id] || "";
          nodes.set(id, node);
        }
        return nodes.get(id);
      },
      createElement: element, createTextNode: text => ({ children: [], textContent: text }),
      querySelector(selector) { return document.getElementById(selector); }, querySelectorAll() { return []; },
      addEventListener(type, fn) { (documentEvents[type] ||= []).push(fn); },
      dispatch(type) { for (const fn of documentEvents[type] || []) fn(); }, body: element("body"),
    };
    const window = element();
    window.scrollTo = () => {};
    window.scrollY = 0;
    window.isSecureContext = false; // banner tests need no service-worker mock
    const media = element(); media.matches = Boolean(options.standalone);
    window.matchMedia = () => media;
    const navigator = { userAgent: options.ua || "Desktop Chrome", standalone: Boolean(options.iosStandalone), maxTouchPoints: options.touch || 0 };
    const localStorage = { getItem: key => storage.get(key) ?? null, setItem(key, value) { if (fail) throw new Error("quota"); storage.set(key, value); }, removeItem: key => storage.delete(key) };
    const session = options.session || new Map();
    const sessionStorage = { getItem: key => session.get(key) ?? null, setItem(key, value) { if (options.sessionFail) throw new Error("session quota"); session.set(key, value); }, removeItem: key => session.delete(key) };
    class BlobMock { constructor(parts) { this.size = [...parts.join("")].reduce((size, char) => { const cp = char.codePointAt(0); return size + (cp <= 127 ? 1 : cp <= 2047 ? 2 : cp <= 65535 ? 3 : 4); }, 0); } }
    const args = [document, localStorage, window, navigator, engine, BlobMock, () => {}, () => {}, () => options.confirm !== false, () => {}, sessionStorage];
    const api = new Function("document", "localStorage", "window", "navigator", "TaskFlowRecommendation", "Blob", "setInterval", "setTimeout", "confirm", "alert", "sessionStorage", source + ";return { tasks:()=>tasks,openAddTaskModal,editTask,displayTasks,createTaskMemo,restoreBackupText,calculatePriorityScore,showScreen,jumpToTaskCard,completeTask,deleteTask,migrateTaskToTomorrow,undoTaskMigration }; ")(...args);
    return { api, n: id => document.getElementById(id), storage, session, descendants, window, media, document, fail: value => { fail = value; },
      initPwa() { new Function("document", "localStorage", "window", "navigator", pwaSource)(document, localStorage, window, navigator); } };
  }
  test("child deadline defaults to parent and remains independently editable", () => {
    const a = app([task("p", { deadline: "2026-12-01" })]);
    a.api.openAddTaskModal("p"); check(a.n("deadlineInput").value === "2026-12-01", "parent default");
    a.n("deadlineInput").value = "2026-12-02"; a.n("deadlineInput").dispatch("input");
    a.n("taskInput").value = "child"; a.n("addButton").click();
    const child = a.api.tasks()[1]; check(child.deadline === "2026-12-02", "own date saved");
    a.api.editTask("p"); a.n("editTaskInput").value = "p"; a.n("editDeadlineInput").value = "2026-12-10"; a.n("editPriorityInput").value = "medium"; a.n("editSizeInput").value = "normal"; a.n("saveEditButton").click();
    check(a.api.tasks()[1].deadline === "2026-12-02", "parent edit does not change child");
  });
  test("parent without deadline defaults to empty", () => { const a = app([task("p")]); a.api.openAddTaskModal("p"); check(a.n("deadlineInput").value === "" && a.n("noDeadlineInput").checked, "empty default"); });
  test("parent dropdown prefills only before manual deadline edits", () => {
    const a = app([task("p", { deadline: "2026-12-01" }), task("q", { deadline: "2026-12-20" })]);
    a.n("parentInput").value = "p"; a.n("parentInput").dispatch("change"); check(a.n("deadlineInput").value === "2026-12-01", "dropdown default");
    a.n("deadlineInput").value = "2026-12-15"; a.n("deadlineInput").dispatch("input");
    a.n("parentInput").value = "q"; a.n("parentInput").dispatch("change"); check(a.n("deadlineInput").value === "2026-12-15", "manual override retained");
  });
  test("legacy child fields unchanged on load", () => { const old = [task("p", { deadline: "2026-12-01" }), task("c", { parentId: "p" })]; const a = app(old); check(a.storage.get("tasks") === JSON.stringify(old) && a.api.tasks()[1].deadline === "", "no saved data/date rewrite"); });
  test("category menu leaves backup and closes from every screen", () => {
    const a = app([task("a", { category: "work" })]);
    for (const from of ["home", "all", "backup"]) {
      a.api.showScreen(from); a.n("taskMenu").showModal();
      a.n("categoryTabs").children.find(button => button.children[0].textContent === "work").click();
      check(!a.n(from === "home" ? "homeScreen" : "allTasksScreen").hidden, "screen transition"); check(!a.n("taskMenu").open, "closed");
    }
  });
  test("help, privacy, install guide navigate from all screens", () => {
    const a = app();
    for (const from of ["home", "all", "backup"]) for (const [button, target] of [["menuHelpButton", "usageGuide"], ["menuPrivacyButton", "privacyGuide"], ["viewInstallGuide", "installGuide"]]) {
      a.api.showScreen(from); a.n("taskMenu").showModal(); a.n(button).click();
      check(!a.n("backupScreen").hidden && !a.n("taskMenu").open, "guide route");
      if (target !== "installGuide") check(a.n(target).open, "guide expands");
    }
  });
  test("task memo saves multiline text and survives reload and restore", () => {
    const a = app([task("p"), task("c", { parentId: "p" })]);
    for (const id of ["p", "c"]) {
      const panel = a.api.createTaskMemo(a.api.tasks().find(t => t.id === id));
      const editor = panel.children.find(n => n.tagName === "TEXTAREA");
      editor.value = "notes\n<script>literal</script>"; editor.dispatch("input"); panel.children.find(n => n.tagName === "BUTTON").click();
    }
    const b = app([], { storage: a.storage }); check(b.api.tasks().every(t => t.note === "notes\n<script>literal</script>"), "reload");
    const c = app(); check(c.api.restoreBackupText(a.storage.get("taskflowData")), "restore success"); check(c.api.tasks()[1].note === b.api.tasks()[1].note, "restore memo");
    c.n("exportButton").click(); check(JSON.parse(c.n("backupText").value).tasks[0].note === b.api.tasks()[0].note, "export memo");
  });
  test("memo draft survives redraw and failed save; old task defaults empty", () => {
    const a = app([task("a")]); const panel = a.api.createTaskMemo(a.api.tasks()[0]); check(!panel.open && panel.children[1].value === "", "collapsed empty");
    panel.children[1].value = "draft"; panel.children[1].dispatch("input"); a.api.displayTasks();
    a.fail(true); panel.children[2].click();
    const retry = a.api.createTaskMemo(a.api.tasks()[0]); check(retry.children[1].value === "draft" && !a.api.tasks()[0].note, "retained draft");
    a.fail(false); retry.children[2].click(); check(a.api.tasks()[0].note === "draft", "retry succeeds");
    check(a.api.createTaskMemo(a.api.tasks()[0]).children[1].hidden, "saved memo editor closes automatically");
  });
  test("score regression values unchanged", () => { const a = app(); check(a.api.calculatePriorityScore(task("x")) === 36, "score unchanged"); });
  test("saved memo can be edited and cleared", () => {
    const a = app([task("a", { note: "old" })]);
    for (const value of ["updated", ""]) {
      const panel = a.api.createTaskMemo(a.api.tasks()[0]); panel.children[1].value = value; panel.children[1].dispatch("input"); panel.children[2].click();
      check(a.api.tasks()[0].note === value, "updated memo");
    }
  });
  test("memo stays hidden on collapsed task cards, even when nonempty", () => {
    const a = app([task("a", { note: "saved memo" }), task("empty")]);
    for (const id of ["a", "empty"]) {
      const card = a.n("allTasksList").children.find(n => n.dataset.taskId === id);
      const memo = a.descendants(card).find(n => n.className === "task-memo");
      const controls = a.descendants(card).find(n => n.className === "task-accordion");
      check(controls.children[0].tagName === "SUMMARY" && controls.children[1] === memo, "collapse control appears above memo");
      check(memo.hidden, "collapsed memo hidden");
      controls.open = true; controls.dispatch("toggle"); check(!memo.hidden, "expanded memo available");
      controls.open = false; controls.dispatch("toggle"); check(memo.hidden, "closing hides memo again");
    }
  });
  test("memo text is not repeated in expanded heading", () => {
    const a = app([task("a", { note: "unique memo text" })]);
    let panel = a.api.createTaskMemo(a.api.tasks()[0]);
    check(panel.children[0].textContent.includes("unique memo text"), "collapsed preview");
    panel.children[0].dispatch("click", { preventDefault() {} });
    check(panel.children[0].textContent === "メモ" && panel.children[1].value === "unique memo text", "editing without duplicate heading");
    panel.children[2].click();
    panel = a.api.createTaskMemo(a.api.tasks()[0]);
    check(panel.open && panel.children[0].textContent === "メモ" && panel.children[4].textContent === "unique memo text", "reading without duplicate heading");
    panel.open = false; panel.dispatch("toggle");
    check(panel.children[0].textContent.includes("unique memo text"), "preview restored on collapse");
  });
  test("memo text opens input directly and save returns to reading", () => {
    const a = app([task("a", { note: "memo text" })]);
    const panel = a.api.createTaskMemo(a.api.tasks()[0]);
    check(panel.children[0].textContent === "メモ：memo text", "inline preview");
    panel.children[0].dispatch("click", { preventDefault() {} });
    check(panel.open && !panel.children[1].hidden, "preview opens editor directly");
    panel.children[1].value = "new text"; panel.children[1].dispatch("input"); panel.children[2].click();
    const read = a.api.createTaskMemo(a.api.tasks()[0]);
    check(read.children[1].hidden && read.children[4].textContent === "new text", "save returns to read");
    check(!read.children.some(n => n.textContent === "編集"), "no extra edit button");
    read.children[4].dispatch("keydown", { key: "Enter", preventDefault() {} });
    check(!read.children[1].hidden, "keyboard text editing");
  });
  test("opening task details shows memo; saving still closes it", () => {
    const a = app([task("a", { note: "saved" }), task("empty")]);
    a.api.jumpToTaskCard("a");
    let card = a.n("allTasksList").children.find(n => n.dataset.taskId === "a");
    let memo = a.descendants(card).find(n => n.className === "task-memo");
    check(memo.open, "navigation opens saved memo");
    memo.children.find(n => n.tagName === "BUTTON").click();
    card = a.n("allTasksList").children.find(n => n.dataset.taskId === "a");
    memo = a.descendants(card).find(n => n.className === "task-memo");
    const controls = a.descendants(card).find(n => n.className === "task-accordion");
    controls.dispatch("toggle"); check(memo.children[1].hidden, "redraw keeps saved memo in reading mode");
    controls.open = false; controls.dispatch("toggle"); controls.open = true; controls.dispatch("toggle");
    check(memo.open, "explicit detail reopen shows memo");
    a.api.jumpToTaskCard("empty");
    const emptyCard = a.n("allTasksList").children.find(n => n.dataset.taskId === "empty");
    check(!a.descendants(emptyCard).find(n => n.className === "task-memo").open, "empty stays collapsed");
  });
  test("invalid backup memo does not replace current data", () => {
    const a = app([task("keep", { note: "safe" })]);
    check(!a.api.restoreBackupText(JSON.stringify({ app: "TaskFlow", version: 1, tasks: [task("bad", { note: 12 })], dailyReviews: {} })), "invalid memo rejected");
    check(a.api.tasks()[0].note === "safe", "original data retained");
  });
  test("unsaved memo warns before leaving", () => {
    const a = app([task("a")]); const panel = a.api.createTaskMemo(a.api.tasks()[0]); panel.children[1].value = "unsaved"; panel.children[1].dispatch("input");
    let warned = false; a.window.dispatch("beforeunload", { preventDefault() { warned = true; } }); check(warned, "unload warning");
  });
  for (const options of [{ ua: "iPhone Safari", expected: true }, { ua: "Android Chrome", expected: true }, { ua: "Desktop Chrome", expected: false }, { ua: "iPhone Safari", standalone: true, expected: false }, { ua: "iPhone Safari", iosStandalone: true, expected: false }]) {
    test(`install hint condition ${JSON.stringify(options)}`, () => { const a = app([], options); a.initPwa(); check(a.n("installHint").hidden !== options.expected, "hint condition"); });
  }
  test("dismissed install hint stays dismissed after reload without changing tasks", () => {
    const a = app([task("a")], { ua: "iPhone Safari" }); const before = a.storage.get("tasks"); a.initPwa(); a.n("dismissInstallHint").click();
    const b = app([], { storage: a.storage, ua: "iPhone Safari" }); b.initPwa();
    check(b.n("installHint").hidden && b.storage.get("tasks") === before, "dismiss persisted independently");
  });
  test("install hint can close when settings cannot be saved", () => {
    const a = app([], { ua: "Android Chrome" }); a.initPwa(); a.fail(true); a.n("dismissInstallHint").click(); check(a.n("installHint").hidden, "no startup/close failure");
  });
  // Release regressions: exercise user-visible actions, not replacement implementations.
  test("oversized Japanese backup is blocked before it can be exported", () => {
    const a = app([task("big", { note: "あ".repeat(1800000) })]);
    a.n("exportButton").click();
    check(a.n("backupPreview").hidden && !a.n("backupText").value, "no unusable export");
    check(a.n("storageMessage").textContent.includes("5MiB"), "size and remedy explained");
  });
  const backup = extra => JSON.stringify({ app: "TaskFlow", version: 1, tasks: [task("a", extra)], dailyReviews: {} });
  const exactBackup = (bytes, japanese = false) => {
    const base = backup({ note: "" });
    const length = bytes - base.length;
    return backup({ note: japanese ? "あ".repeat(Math.floor(length / 3)) + "x".repeat(length % 3) : "x".repeat(length) });
  };
  for (const japanese of [false, true]) for (const delta of [-1, 0, 1]) {
    test(`restore UTF8 limit japanese=${japanese} delta=${delta}`, () => {
      const a = app([task("keep")]);
      check(Boolean(a.api.restoreBackupText(exactBackup(5 * 1024 * 1024 + delta, japanese))) === (delta <= 0), "inclusive byte limit");
      if (delta > 0) check(a.api.tasks()[0].id === "keep", "rejection preserves data");
    });
  }
  for (const japanese of [false, true]) for (const delta of [-1, 0, 1]) {
    test(`export UTF8 limit japanese=${japanese} delta=${delta}`, () => {
      const seed = task("a", { completedAt: null, note: "" });
      const overhead = JSON.stringify({ app: "TaskFlow", version: 1, exportedAt: "2000-01-01T00:00:00.000Z", tasks: [seed], dailyReviews: {} }, null, 2).length;
      const length = 5 * 1024 * 1024 + delta - overhead;
      seed.note = japanese ? "あ".repeat(Math.floor(length / 3)) + "x".repeat(length % 3) : "x".repeat(length);
      const a = app([seed]); a.n("exportButton").click();
      check(a.n("backupPreview").hidden === (delta > 0), "same inclusive byte limit as restore");
      if (delta <= 0) {
        const b = app(); check(b.api.restoreBackupText(a.n("backupText").value), "exported boundary backup restores");
        check(b.api.tasks()[0].note === seed.note, "full boundary memo preserved");
      } else check(!a.n("backupText").value && a.api.tasks()[0].note === seed.note, "rejection does not trim data");
    });
  }
  test("export restore roundtrip preserves every task and review field", () => {
    const tasks = [task("p", { category: "大学", note: "資料\n本文" }), task("c", { parentId: "p", deadline: "2026-12-01", plannedDate: "2026-11-20", progress: 35, migrationCount: 2, migrationUndo: { plannedDate: null, migrationCount: 1, targetDate: "2026-11-20" } })];
    const original = { app: "TaskFlow", version: 1, tasks, dailyReviews: { "2026-10-31": { memo: "振り返り" } } };
    const a = app([], { storage: new Map([["taskflowData", JSON.stringify(original)]]) });
    a.n("exportButton").click(); const b = app(); check(b.api.restoreBackupText(a.n("backupText").value), "restore");
    const restored = JSON.parse(b.storage.get("taskflowData"));
    check(JSON.stringify(restored.tasks) === JSON.stringify(tasks) && JSON.stringify(restored.dailyReviews) === JSON.stringify(original.dailyReviews), "all fields preserved");
  });
  test("resuming a child draft retains its parent and registering resets it", () => {
    const a = app([task("p", { deadline: "2026-12-01" })]);
    a.api.openAddTaskModal("p"); a.n("taskInput").value = "予約"; a.n("cancelAddButton").click(); a.api.openAddTaskModal();
    check(a.n("parentInput").value === "p" && a.n("taskInput").value === "予約", "whole draft resumes");
    a.n("addButton").click(); check(a.api.tasks()[1].parentId === "p", "child created");
    a.api.openAddTaskModal(); check(a.n("parentInput").value === "" && a.n("taskInput").value === "", "next independent task starts clean");
  });
  test("switching child draft to another parent requires consent", () => {
    const a = app([task("p"), task("q")], { confirm: false });
    a.api.openAddTaskModal("p"); a.n("taskInput").value = "予約"; a.n("cancelAddButton").click(); a.api.openAddTaskModal("q");
    check(a.n("parentInput").value === "p" && a.n("taskInput").value === "予約", "declined switch retains draft");
  });
  class QuotaMap extends Map {
    set(key, value) {
      const next = new Map(this); next.set(key, value);
      if ([...next].reduce((n, [k, v]) => n + (k.length + v.length) * 2, 0) > 5 * 1024 * 1024) {
        const error = new Error("quota exceeded"); error.name = "QuotaExceededError"; throw error;
      }
      return super.set(key, value);
    }
  }
  test("failed restore rolls back only its temporary recovery copy and permits saves", () => {
    const old = backup({ note: "x".repeat(1200000) }); const storage = new QuotaMap(); storage.set("taskflowData", old);
    const a = app([], { storage });
    check(!a.api.restoreBackupText(backup({ note: "x".repeat(1500000) })), "restore exceeds quota");
    check(storage.get("taskflowData") === old && !storage.has("taskflowBeforeRestore"), "original bytes and free space restored");
    check(a.n("storageMessage").textContent.includes("空き容量"), "actionable capacity error");
    a.api.editTask("a"); a.n("editTaskInput").value = "変更"; a.n("saveEditButton").click();
    check(JSON.parse(storage.get("taskflowData")).tasks[0].title === "変更", "normal saving still works");
  });
  test("failed restore preserves an older recovery copy exactly", () => {
    const storage = new QuotaMap(); storage.set("taskflowData", backup({ note: "x".repeat(1200000) })); storage.set("taskflowBeforeRestore", "older recovery");
    const a = app([], { storage }); a.api.restoreBackupText(backup({ note: "x".repeat(1500000) }));
    check(storage.get("taskflowBeforeRestore") === "older recovery", "older copy restored");
  });
  for (const editing of [false, true]) test(`unsaved ${editing ? "edit" : "add"} form warns on unload`, () => {
    const a = app([task("a")]); if (editing) a.api.editTask("a"); else a.api.openAddTaskModal();
    a.n(editing ? "editTaskInput" : "taskInput").value = "未保存";
    let warned = false; a.window.dispatch("beforeunload", { preventDefault() { warned = true; } }); check(warned, "draft warning");
  });
  test("canceling edit refuses to discard changed input without consent", () => {
    const a = app([task("a")], { confirm: false }); a.api.editTask("a"); a.n("editTaskInput").value = "未保存"; a.n("cancelEditButton").click();
    check(!a.n("editModal").hidden && a.n("editTaskInput").value === "未保存", "draft retained");
  });
  test("pagehide recovers add form and memo drafts after reload without changing tasks", () => {
    const a = app([task("a")]); a.api.openAddTaskModal(); a.n("taskInput").value = "入力途中";
    const p = a.api.createTaskMemo(a.api.tasks()[0]); p.children[1].value = "未保存メモ"; p.children[1].dispatch("input");
    const old = a.storage.get("tasks"); a.window.dispatch("pagehide");
    const b = app([], { storage: a.storage, session: a.session }); b.api.openAddTaskModal();
    check(b.n("taskInput").value === "入力途中" && b.api.createTaskMemo(b.api.tasks()[0]).children[1].value === "未保存メモ", "draft recovery");
    check(a.storage.get("tasks") === old && !a.storage.has("taskflowData"), "saved tasks untouched");
  });
  test("pagehide recovers edited form after reload", () => {
    const a = app([task("a")]); a.api.editTask("a"); a.n("editTaskInput").value = "編集途中"; a.window.dispatch("pagehide");
    const b = app([], { storage: a.storage, session: a.session });
    check(!b.n("editModal").hidden && b.n("editTaskInput").value === "編集途中", "edit restored");
  });
  test("backup warns about unsaved task memo and keeps saved memo intact", () => {
    const a = app([task("a", { note: "保存済み" })]); const p = a.api.createTaskMemo(a.api.tasks()[0]); p.children[1].value = "未保存"; p.children[1].dispatch("input");
    a.n("exportButton").click(); check(a.n("backupSummary").textContent.includes("未保存のタスクメモ"), "warning");
    check(JSON.parse(a.n("backupText").value).tasks[0].note === "保存済み", "no implicit save or data format change");
  });
  for (const filter of ["search", "hasDeadline", "noDeadline", "graph", "category"]) test(`nested children respect ${filter} and counts`, () => {
    const parent = task("p", { title: "旅行", category: "大学" });
    const child = task("c", { title: "ホテル", deadline: "2099-12-01", category: filter === "category" ? "生活" : "大学", parentId: "p" });
    const a = app([parent, child]);
    if (filter === "search") a.n("taskSearch").value = "旅行";
    else if (filter === "graph") {
      const bar = a.n("deadlineChart").children.find(n => n.className.includes("deadline-later"));
      check(bar, "deadline bar exists"); bar.click();
    } else if (filter === "category") { a.n("listCategorySelect").value = "category:大学"; a.n("listCategorySelect").dispatch("change"); }
    else a.n("taskFilter").value = filter;
    a.api.displayTasks();
    const ids = a.descendants(a.n("allTasksList")).filter(n => n.dataset?.taskId).map(n => n.dataset.taskId);
    const expected = ["hasDeadline", "graph"].includes(filter) ? ["c"] : ["p"];
    check(JSON.stringify(ids) === JSON.stringify(expected), `cards ${JSON.stringify(ids)}`);
    check(a.n("allTasksCountDetails").textContent.includes("絞り込み後1タスク"), "count matches");
  });
  test("failed delete and complete preserve stored data; successful completion can be undone", () => {
    const a = app([task("a", { progress: 35 })]); const original = a.storage.get("tasks"); a.fail(true);
    a.api.deleteTask("a"); a.api.completeTask("a"); check(a.storage.get("tasks") === original && !a.api.tasks()[0].completed, "rollback");
    a.fail(false); a.api.completeTask("a"); a.n("undoCompletionButton").click();
    check(!a.api.tasks()[0].completed && a.api.tasks()[0].progress === 35, "completion undo");
  });
  test("consented parent switch starts clean and independent choice stays independent", () => {
    const a = app([task("p"), task("q")]); a.api.openAddTaskModal("p"); a.n("taskInput").value = "古い入力";
    a.api.openAddTaskModal("q"); check(a.n("taskInput").value === "" && a.n("parentInput").value === "q", "new child has no stale title");
    a.n("parentInput").value = ""; a.n("parentInput").dispatch("change"); a.n("taskInput").value = "独立"; a.n("addButton").click();
    check(a.api.tasks()[2].parentId === null, "explicit independent selection");
  });
  test("navigation preserves add and memo drafts", () => {
    const a = app([task("a")]); a.api.openAddTaskModal(); a.n("taskInput").value = "下書き"; a.n("cancelAddButton").click();
    const p = a.api.createTaskMemo(a.api.tasks()[0]); p.children[1].value = "メモ下書き"; p.children[1].dispatch("input");
    for (const screen of ["backup", "all", "home"]) { a.api.showScreen(screen); a.api.displayTasks(); }
    a.api.openAddTaskModal(); check(a.n("taskInput").value === "下書き" && a.api.createTaskMemo(a.api.tasks()[0]).children[1].value === "メモ下書き", "no input lost");
  });
  test("visibility hide protects drafts even without beforeunload", () => {
    const a = app(); a.api.openAddTaskModal(); a.n("taskInput").value = "携帯で入力";
    a.document.hidden = true; a.document.dispatch("visibilitychange");
    const b = app([], { storage: a.storage, session: a.session }); b.api.openAddTaskModal();
    check(b.n("taskInput").value === "携帯で入力", "draft survives visibility transition");
  });
  test("temporary draft storage failure leaves input and task saving available", () => {
    const a = app([], { sessionFail: true }); a.api.openAddTaskModal(); a.n("taskInput").value = "保存できる"; a.window.dispatch("pagehide");
    check(a.n("taskInput").value === "保存できる" && a.n("storageMessage").textContent.includes("一時退避ができません"), "warn without clearing");
    a.n("addButton").click(); check(a.api.tasks()[0].title === "保存できる" && a.storage.has("taskflowData"), "task saving independent");
  });
  test("successful saves do not resurrect previous add, edit or memo drafts", () => {
    const a = app([task("a")]); a.api.openAddTaskModal(); a.n("taskInput").value = "追加"; a.window.dispatch("pagehide"); a.n("addButton").click();
    a.api.editTask("a"); a.n("editTaskInput").value = "編集保存"; a.window.dispatch("pagehide"); a.n("saveEditButton").click();
    const p = a.api.createTaskMemo(a.api.tasks()[0]); p.children[1].value = "保存するメモ"; p.children[1].dispatch("input"); a.window.dispatch("pagehide"); p.children[2].click();
    const b = app([], { storage: a.storage, session: a.session });
    check(b.n("editModal").hidden && b.n("taskInput").value === "", "forms cleared after save");
    check(b.api.createTaskMemo(b.api.tasks()[0]).children[1].hidden && !a.session.has("taskflowInputDrafts"), "no saved draft resurrected");
  });
  test("restore canceled or unable to create recovery leaves all stored bytes unchanged", () => {
    const raw = backup({ note: "original" }); const storage = new Map([["taskflowData", raw], ["taskflowBeforeRestore", "old recovery"]]);
    const a = app([], { storage, confirm: false }); check(!a.api.restoreBackupText(backup({ note: "new" })), "cancel");
    const b = app([], { storage }); b.fail(true); check(!b.api.restoreBackupText(backup({ note: "new" })), "write error");
    check(storage.get("taskflowData") === raw && storage.get("taskflowBeforeRestore") === "old recovery", "both originals intact");
  });
  test("successful restore preserves exact old bytes in recovery", () => {
    const raw = backup({ note: "original" }); const a = app([], { storage: new Map([["taskflowData", raw]]) });
    check(a.api.restoreBackupText(backup({ note: "new" })), "restore");
    check(JSON.parse(a.storage.get("taskflowBeforeRestore")).current === raw && a.api.tasks()[0].note === "new", "protected replacement");
  });
  test("parent delete retains child and migration undo retains task data", () => {
    const a = app([task("p"), task("c", { parentId: "p", note: "子のメモ" })]);
    a.api.completeTask("p"); check(!a.api.tasks()[0].completed, "parent blocked"); a.api.deleteTask("p");
    check(a.api.tasks().length === 1 && a.api.tasks()[0].parentId === null && a.api.tasks()[0].note === "子のメモ", "child retained");
    a.api.migrateTaskToTomorrow("c"); a.api.undoTaskMigration("c"); check(a.api.tasks()[0].plannedDate === null && a.api.tasks()[0].note === "子のメモ", "migration undo");
  });
  test("matching parent and child remain grouped and child completion still works", () => {
    const a = app([task("p", { title: "一致 親" }), task("c", { title: "一致 子", parentId: "p" })]);
    a.n("taskSearch").value = "一致"; a.api.displayTasks();
    const ids = a.descendants(a.n("allTasksList")).filter(n => n.dataset?.taskId).map(n => n.dataset.taskId);
    check(JSON.stringify(ids) === JSON.stringify(["p", "c"]) && a.n("allTasksCount").textContent.includes("1組"), "one group and two tasks");
    a.api.completeTask("c"); a.api.completeTask("p"); check(a.api.tasks().every(t => t.completed), "completion behavior unchanged");
  });
  test("invalid backups and invalid draft data do not initialize existing tasks", () => {
    const storage = new Map([["taskflowData", backup({ note: "keep" })]]); const raw = storage.get("taskflowData");
    const a = app([], { storage, session: new Map([["taskflowInputDrafts", "{"]]) });
    for (const text of ["{", JSON.stringify({ app: "TaskFlow", version: 1, tasks: [task("x"), task("x")], dailyReviews: {} }), backup({ parentId: "a" })]) check(!a.api.restoreBackupText(text), "invalid restore");
    check(storage.get("taskflowData") === raw && a.api.tasks()[0].note === "keep", "original retained");
  });
  report(`${passed} app tests passed; ${failures.length} failed`);
  if (failures.length) throw new Error(`${failures.length} failed: ${failures.join(", ")}`);
  return passed;
}
module.exports = runTests;
if (typeof require !== "undefined" && require.main === module) {
  const fs = require("node:fs"), path = require("node:path");
  const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
  runTests(require("../recommendation.js"), read("script.js"), read("pwa.js"), console.log);
}
