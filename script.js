/* ===== 今日のプラン用HTML要素 ===== */

const todayCount = document.getElementById("todayCount");
const tomorrowCount = document.getElementById("tomorrowCount");
const weekCount = document.getElementById("weekCount");

const todayTaskList = document.getElementById("todayTaskList");
const tomorrowTaskList = document.getElementById("tomorrowTaskList");
const weekTaskList = document.getElementById("weekTaskList");

const todayEmptyMessage = document.getElementById("todayEmptyMessage");

/* ===== HTML要素を取得 ===== */

const taskInput = document.getElementById("taskInput");
const addButton = document.getElementById("addButton");
const taskList = document.getElementById("taskList");
const completedList = document.getElementById("completedList");

const viewAllCompletedButton = document.getElementById(
  "viewAllCompletedButton",
);

const MAX_VISIBLE_COMPLETED = 4;

let showAllCompleted = false;

const taskCount = document.getElementById("taskCount");
const viewAllButton = document.getElementById("viewAllButton");

const homeScreen = document.getElementById("homeScreen");
const allTasksScreen = document.getElementById("allTasksScreen");
const backupScreen = document.getElementById("backupScreen");
const addTaskModal = document.getElementById("addTaskModal");
const taskMenu = document.getElementById("taskMenu");
const parentInput = document.getElementById("parentInput");
const editParentInput = document.getElementById("editParentInput");
// 折りたたみの開閉は画面内の状態として保持する。
const expandedTaskIds = new Set();
const subtaskGroupStates = new Map();
const backButton = document.getElementById("backButton");

const allTasksList = document.getElementById("allTasksList");
const allTasksCount = document.getElementById("allTasksCount");
const taskSearch = document.getElementById("taskSearch");
const taskSort = document.getElementById("taskSort");
const taskFilter = document.getElementById("taskFilter");
const emptyTaskMessage = document.getElementById("emptyTaskMessage");

const deadlineInput = document.getElementById("deadlineInput");
const noDeadlineInput = document.getElementById("noDeadlineInput");
const editNoDeadlineInput = document.getElementById("editNoDeadlineInput");
function syncDeadlineInput(checkbox, input) {
  input.disabled = checkbox.checked;
}
noDeadlineInput.addEventListener("change", () => syncDeadlineInput(noDeadlineInput, deadlineInput));
editNoDeadlineInput.addEventListener("change", () => syncDeadlineInput(editNoDeadlineInput, editDeadlineInput));
const priorityInput = document.getElementById("priorityInput");
const sizeInput = document.getElementById("sizeInput");
const plannedDateInput = document.getElementById("plannedDateInput");
const categoryInput = document.getElementById("categoryInput");
const editPlannedDateInput = document.getElementById("editPlannedDateInput");
const editCategoryInput = document.getElementById("editCategoryInput");
let selectedCategory = "";
const LIST_PAGE_SIZE = 20;
let listPage = 0;
let listSignature = "";
let selectionMode = false;
const selectedTaskIds = new Set();
let pageTaskIds = [];
let pendingJumpId = null;

/* ===== 編集フォーム用 ===== */

const editModal = document.getElementById("editModal");

const editTaskInput = document.getElementById("editTaskInput");
const editDeadlineInput = document.getElementById("editDeadlineInput");
const editPriorityInput = document.getElementById("editPriorityInput");
const editSizeInput = document.getElementById("editSizeInput");

const saveEditButton = document.getElementById("saveEditButton");
const cancelEditButton = document.getElementById("cancelEditButton");

let editingTaskId = null;

/* ===== デイリーレビュー用HTML要素 ===== */

const reviewCompletedCount = document.getElementById("reviewCompletedCount");

const reviewRemainingCount = document.getElementById("reviewRemainingCount");

const reviewCompletedList = document.getElementById("reviewCompletedList");

const reviewRemainingList = document.getElementById("reviewRemainingList");

const reviewCompletedEmpty = document.getElementById("reviewCompletedEmpty");

const reviewRemainingEmpty = document.getElementById("reviewRemainingEmpty");

const reviewMemo = document.getElementById("reviewMemo");

const saveReviewButton = document.getElementById("saveReviewButton");

const reviewSaveMessage = document.getElementById("reviewSaveMessage");

/* ===== データ管理 ===== */

const STORAGE_KEY = "taskflowData";
let storageBlocked = false;
let lastStoredValue = null;
function notifyStorage(message) {
  const element = document.getElementById("storageMessage");
  element.textContent = message;
  element.hidden = false;
  const localMessage = addTaskModal.open ? document.getElementById("addTaskMessage")
    : !editModal.hidden ? document.getElementById("editTaskMessage") : null;
  if (localMessage) { localMessage.textContent = message; localMessage.hidden = false; }
}
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && formatDate(date) === value;
}
function validateData(data) {
  if (!data || !Array.isArray(data.tasks) || !data.dailyReviews ||
      typeof data.dailyReviews !== "object" || Array.isArray(data.dailyReviews)) throw new Error("Invalid data");
  const ids = new Set();
  for (const task of data.tasks) {
    if (!task || typeof task.id !== "string" || !task.id || ids.has(task.id) ||
        typeof task.title !== "string" || !task.title.trim() ||
        (task.deadline != null && task.deadline !== "" && !validDate(task.deadline)) ||
        !["high", "medium", "low"].includes(task.priority) ||
        !["short", "normal", "long", "veryLong"].includes(task.size) ||
        !Number.isFinite(task.progress ?? 0) || (task.progress ?? 0) < 0 || (task.progress ?? 0) > 100 ||
        (task.progressBeforeCompletion != null && (!Number.isFinite(task.progressBeforeCompletion) || task.progressBeforeCompletion < 0 || task.progressBeforeCompletion > 100)) ||
        typeof task.completed !== "boolean" ||
        (task.completedAt != null && (typeof task.completedAt !== "string" || Number.isNaN(Date.parse(task.completedAt)))) ||
        (task.plannedDate != null && !validDate(task.plannedDate)) ||
        (task.category != null && (typeof task.category !== "string" || task.category.length > 40)) ||
        (task.migrationCount != null && (!Number.isSafeInteger(task.migrationCount) || task.migrationCount < 0))) throw new Error("Invalid task");
    ids.add(task.id);
    if (task.migrationUndo != null) {
      const undo = task.migrationUndo;
      if (typeof undo !== "object" || Array.isArray(undo) ||
          (undo.plannedDate !== null && !validDate(undo.plannedDate)) ||
          !Number.isSafeInteger(undo.migrationCount) || undo.migrationCount < 0 ||
          !validDate(undo.targetDate)) throw new Error("Invalid migration undo");
    }
  }
  for (const [day, review] of Object.entries(data.dailyReviews)) {
    if (!validDate(day) || !review || typeof review.memo !== "string") throw new Error("Invalid review");
  }
  const byId = new Map(data.tasks.map(task => [task.id, task]));
  for (const task of data.tasks) {
    if (task.parentId != null && task.parentId !== "") {
      const parent = byId.get(task.parentId);
      if (typeof task.parentId !== "string" || !parent || parent === task || parent.parentId) {
        throw new Error("Invalid parent task");
      }
    }
  }
  return data;
}

// 旧版の数値IDや未保存の追加項目を、現在の形式へ変換する。
// 元のlocalStorageは変更せず、読み込み後のコピーだけを変換する。
function migrateLegacyData(data) {
  if (!data || !Array.isArray(data.tasks)) return data;
  return {
    ...data,
    tasks: data.tasks.map(task => {
      if (!task || typeof task !== "object" || Array.isArray(task)) return task;
      return {
        ...task,
        id: typeof task.id === "number" && Number.isFinite(task.id) ? String(task.id) : task.id,
        deadline: task.deadline ?? "",
        priority: task.priority ?? "medium",
        size: task.size ?? "normal",
        progress: task.progress ?? 0,
        completed: task.completed ?? false,
        completedAt: task.completedAt ?? null,
      };
    }),
  };
}
function readData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    lastStoredValue = saved;
    const data = saved === null ? {
      tasks: JSON.parse(localStorage.getItem("tasks") ?? "[]"),
      dailyReviews: JSON.parse(localStorage.getItem("dailyReviews") ?? "{}"),
    } : JSON.parse(saved);
    if (saved !== null && (data.app !== "TaskFlow" || data.version !== 1)) throw new Error("Invalid version");
    return validateData(saved === null ? migrateLegacyData(data) : data);
  } catch (error) {
    storageBlocked = true;
    notifyStorage(`保存データを読み込めないため、追加・変更を停止しています。元のデータは保持しています。このメッセージをお知らせください。（${error.message}）`);
    return { tasks: [], dailyReviews: {} };
  }
}
const initialData = readData();
let tasks = initialData.tasks;

/* ===== 振り返りデータ ===== */

let dailyReviews = initialData.dailyReviews;
let savedSnapshot = JSON.stringify({ tasks, dailyReviews });
let reviewDate = formatDate(new Date());
let reviewDirty = false;
function persistData() {
  try {
    if (storageBlocked) {
      const previous = JSON.parse(savedSnapshot);
      tasks = previous.tasks;
      dailyReviews = previous.dailyReviews;
      // 読み込み失敗の原因を示すメッセージを残す。
      return false;
    }
    if (localStorage.getItem(STORAGE_KEY) !== lastStoredValue) {
      notifyStorage("別のタブでデータが更新されています。未保存メモを控えてから再読み込みしてください。");
      const previous = JSON.parse(savedSnapshot);
      tasks = previous.tasks;
      dailyReviews = previous.dailyReviews;
      displayTasks();
      return false;
    }
    const data = validateData({ tasks, dailyReviews });
    const serialized = JSON.stringify({ app: "TaskFlow", version: 1, ...data });
    localStorage.setItem(STORAGE_KEY, serialized);
    lastStoredValue = serialized;
    savedSnapshot = JSON.stringify(data);
    return true;
  } catch (error) {
    const previous = JSON.parse(savedSnapshot);
    tasks = previous.tasks;
    dailyReviews = previous.dailyReviews;
    notifyStorage(`保存できませんでした。変更は反映していません。入力を控え、このメッセージをお知らせください。（${error.name}: ${error.message}）`);
    displayTasks();
    return false;
  }
}

function saveDailyReviews() {
  return persistData();
}

const MAX_VISIBLE_TASKS = 5;
let currentScreen = "home";
let showAllToday = false;
let selectedDeadlineBucket = "";

function saveTasks() {
  return persistData();
}

/* ===== タスク追加 ===== */

addButton.addEventListener("click", function () {
  const title = taskInput.value.trim();

  if (title === "") {
    taskInput.setCustomValidity("タスク名を入力してください。");
    taskInput.reportValidity();
    return;
  }
  taskInput.setCustomValidity("");

  const newTask = {
    id: globalThis.crypto?.randomUUID?.() ?? createTaskId(),
    title: title,
    plannedDate: plannedDateInput.value || null,
    category: categoryInput.value.trim(),
    parentId: parentInput.value || null,
    deadline: noDeadlineInput.checked ? "" : deadlineInput.value,
    priority: priorityInput.value,
    size: sizeInput.value,
    progress: 0,
    completed: false,
    completedAt: null,
  };

  tasks.push(newTask);
  if (!saveTasks()) return;
  addTaskModal.close();

  taskInput.value = "";
  deadlineInput.value = "";
  plannedDateInput.value = "";
  categoryInput.value = "";
  parentInput.value = "";
  document.getElementById("addTaskAdvanced").open = false;
  noDeadlineInput.checked = false;
  syncDeadlineInput(noDeadlineInput, deadlineInput);
  priorityInput.value = "medium";
  sizeInput.value = "normal";

  displayTasks();
});
taskInput.addEventListener("input", () => taskInput.setCustomValidity(""));

/* ===== 完了・編集・削除 ===== */

function completeTask(id) {
  const task = tasks.find((task) => task.id === id);

  if (!task || task.completed) return;

  if (tasks.some(child => child.parentId === id && !child.completed)) {
    alert("小さなタスクが残っています。先に中のタスクを完了してください。");
    return;
  }

  task.progressBeforeCompletion = task.progress ?? 0;
  task.completed = true;
  task.progress = 100;
  task.completedAt = new Date().toISOString();

  if (!saveTasks()) return;
  displayTasks();
  showCompletionUndo(task);
}

// 次の完了操作か「閉じる」まで、直近の単体／一括完了を取り消せる。
let lastCompletion = null;
function showCompletionUndo(value) {
  const completed = Array.isArray(value) ? value : [value];
  lastCompletion = { items: completed.map(task => ({ id: task.id, completedAt: task.completedAt })), bulk: Array.isArray(value) };
  document.getElementById("completionUndoMessage").textContent = lastCompletion.bulk ? `${completed.length}件を完了しました。まとめて元に戻せます。` : `「${completed[0].title}」を完了しました。`;
  document.getElementById("completionUndo").hidden = false;
}
function hideCompletionUndo() {
  lastCompletion = null;
  document.getElementById("completionUndo").hidden = true;
}
document.getElementById("undoCompletionButton").addEventListener("click", () => {
  const targets = getCompletionUndoTargets();
  if (!targets.length) {
    hideCompletionUndo();
    return;
  }
  for (const task of targets) {
    restoreIncompleteTask(task);
    const parent = tasks.find(item => item.id === task.parentId);
    if (parent?.completed) restoreIncompleteTask(parent);
  }
  if (!saveTasks()) return;
  hideCompletionUndo();
  displayTasks();
  notifyStorage(`${targets.length}件の完了を取り消し、元の進捗に戻しました。`);
});
function getCompletionUndoTargets() {
  return (lastCompletion?.items || []).map(record => tasks.find(task => task.id === record.id && task.completed && task.completedAt === record.completedAt)).filter(Boolean);
}
document.getElementById("dismissCompletionUndo").addEventListener("click", hideCompletionUndo);

function deleteTask(id) {
  const hasChildren = tasks.some(task => task.parentId === id);
  const result = confirm(hasChildren
    ? "この大きなタスクを削除しますか？ 中の小さなタスクは削除せず、独立したタスクとして残します。"
    : "このタスクを削除しますか？");

  if (!result) return;

  tasks = tasks.filter((task) => task.id !== id);
  tasks.forEach(task => { if (task.parentId === id) task.parentId = null; });

  saveTasks();
  displayTasks();
}

/* ===== タスク編集 ===== */

function editTask(id) {
  const task = tasks.find((task) => task.id === id);

  if (!task) {
    return;
  }

  editingTaskId = id;
  document.getElementById("editParentSearch").value = "";
  document.getElementById("editTaskMessage").hidden = true;

  // 現在の設定をフォームに反映
  editTaskInput.value = task.title;
  editDeadlineInput.value = task.deadline || "";
  editPlannedDateInput.value = task.plannedDate || "";
  editCategoryInput.value = task.category || "";
  populateParentOptions(editParentInput, id, task.parentId || "");
  editNoDeadlineInput.checked = !task.deadline;
  syncDeadlineInput(editNoDeadlineInput, editDeadlineInput);
  editPriorityInput.value = task.priority || "medium";
  editSizeInput.value = task.size || "normal";

  // 編集画面を開く
  modalReturnFocus = document.activeElement;
  editModal.hidden = false;
  setEditBackgroundInert(true);
  document.body.classList.add("modal-open");
  editTaskInput.focus();
}

/* ===== 編集内容を保存 ===== */

saveEditButton.addEventListener("click", function () {
  const task = tasks.find((task) => task.id === editingTaskId);

  if (!task) {
    return;
  }

  const newTitle = editTaskInput.value.trim();

  if (newTitle === "") {
    alert("タスク名を入力してください");
    return;
  }

  const oldDeadline = task.deadline || "";
  const oldSize = task.size || "normal";
  const oldPlannedDate = task.plannedDate || "";

  // 編集内容を反映
  task.title = newTitle;
  task.deadline = editNoDeadlineInput.checked ? "" : editDeadlineInput.value;
  task.priority = editPriorityInput.value;
  task.size = editSizeInput.value;
  task.plannedDate = editPlannedDateInput.value || null;
  task.category = editCategoryInput.value.trim();
  task.parentId = editParentInput.value || null;

  // 手動予定日は編集内容を維持し、変更前の移行履歴だけを無効にする。
  if (oldDeadline !== task.deadline || oldSize !== task.size || oldPlannedDate !== (task.plannedDate || "")) {
    delete task.migrationUndo;
  }

  if (!saveTasks()) return;
  displayTasks();

  // 編集画面を閉じる
  closeEditModal();
});

/* ===== 編集をキャンセル ===== */

cancelEditButton.addEventListener("click", function () {
  closeEditModal();
});

function updateProgress(id, newProgress) {
  const task = tasks.find((task) => task.id === id);

  if (!task) return;

  task.progress = Math.max(0, Math.min(100, Number(newProgress) || 0));

  saveTasks();
  displayTasks();
}

/* ===== 並び替え ===== */

function sortByDeadline(taskArray) {
  return [...taskArray].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;

    return a.deadline.localeCompare(b.deadline);
  });
}

function sortTasks(taskArray, sortType) {
  const sorted = [...taskArray];
  if (sortType === "recommendation") return sortByRecommendation(sorted);

  if (sortType === "deadline") {
    return sortByDeadline(sorted);
  }

  if (sortType === "priority") {
    const order = { high: 0, medium: 1, low: 2 };

    return sorted.sort((a, b) => {
      return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
    });
  }

  if (sortType === "progress") {
    return sorted.sort((a, b) => {
      return (b.progress ?? 0) - (a.progress ?? 0);
    });
  }

  return sorted;
}

/* ===== 自動スケジュール計算 ===== */

// 作業規模ごとの必要日数
const WORK_DAYS = {
  short: 1,
  normal: 2,
  long: 4,
  veryLong: 7,
};

// 日付を YYYY-MM-DD 形式にする
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// 日付に指定日数を加算する
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/* ===== 残りの作業日数を計算 ===== */

function calculateRemainingDays(task) {
  const totalDays = WORK_DAYS[task.size] ?? 2;

  const progress = Math.max(0, Math.min(100, Number(task.progress ?? 0) || 0));

  const remainingDays = Math.ceil((totalDays * (100 - progress)) / 100);

  return remainingDays;
}

// おすすめ開始日を計算する

function calculateStartDate(task) {
  if (!task.deadline) {
    return null;
  }

  const remainingDays = calculateRemainingDays(task);

  // 残り作業がない場合
  if (remainingDays === 0) {
    return null;
  }

  const bufferDays = 1;

  const [year, month, day] = task.deadline.split("-").map(Number);

  const deadline = new Date(year, month - 1, day);

  const startDate = addDays(deadline, -(remainingDays + bufferDays));

  return formatDate(startDate);
}

/* ===== 優先順位の自動計算 ===== */

function calculatePriorityScore(task) {
  let score = 0;

  // ① 締切によるスコア（最大40点）
  if (task.deadline) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [year, month, day] = task.deadline.split("-").map(Number);

    const deadline = new Date(year, month - 1, day);

    const daysLeft = Math.round((deadline - today) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      score += 40;
    } else if (daysLeft <= 1) {
      score += 40;
    } else if (daysLeft <= 3) {
      score += 35;
    } else if (daysLeft <= 7) {
      score += 25;
    } else if (daysLeft <= 14) {
      score += 15;
    } else {
      score += 5;
    }
  }

  // ② 重要度によるスコア（最大30点）
  const priorityScores = {
    high: 30,
    medium: 20,
    low: 10,
  };

  score += priorityScores[task.priority] ?? 20;

  // ③ 作業規模によるスコア（最大20点）

  // ③ 残りの作業量によるスコア（最大20点）

  const remainingDays = calculateRemainingDays(task);

  const sizeScore = Math.min(20, Math.ceil((remainingDays / 7) * 20));

  score += sizeScore;

  // ④ 進捗率によるスコア（最大10点）
  const progress = Math.max(0, Math.min(100, Number(task.progress ?? 0)));

  score += Math.round((100 - progress) / 10);

  return score;
}

// スコアが高い順に並べる
function sortByRecommendation(taskArray) {
  return [...taskArray].sort((a, b) => {
    const scoreDifference =
      calculatePriorityScore(b) - calculatePriorityScore(a);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    // 同点の場合は締切が近い方を優先
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;

    return a.deadline.localeCompare(b.deadline);
  });
}

/* ===== タスクカード作成 ===== */

function createTaskCard(task, listContext = false) {
  const li = document.createElement("li");

  li.dataset.taskId = task.id;

  // タスク名
  const title = document.createElement("span");
  title.textContent = task.title;

  // 詳細情報
  const priorityLabels = {
    high: "高",
    medium: "中",
    low: "低",
  };

  const sizeLabels = {
    short: "短い",
    normal: "普通",
    long: "長い",
    veryLong: "かなり長い",
  };

  const details = document.createElement("small");

  details.textContent =
    "締切：" +
    (task.deadline || "なし") +
    " | 重要度：" +
    (priorityLabels[task.priority] || "未設定") +
    " | 作業規模：" +
    (sizeLabels[task.size] || "未設定");

  const taskInfo = document.createElement("div");
  taskInfo.className = "task-info";

  taskInfo.appendChild(title);
  const foldedInfo = document.createElement("div");
  foldedInfo.className = "task-folded-info";
  foldedInfo.appendChild(details);
  if (task.category) {
    const category = document.createElement("small");
    category.textContent = `分類：${task.category}`;
    foldedInfo.appendChild(category);
  }

  // ===== 移行回数の表示 =====

  if ((task.migrationCount ?? 0) > 0) {
    const migrationText = document.createElement("small");

    migrationText.className = "migration-text";
    migrationText.textContent = `↪ ${task.migrationCount}回移行済み`;

    foldedInfo.appendChild(migrationText);
  }

  // ===== 優先スコア表示 =====

  const priorityScore = calculatePriorityScore(task);

  const scoreBadge = document.createElement("span");
  scoreBadge.className = "priority-score";

  if (priorityScore >= 75) {
    scoreBadge.textContent = "最優先";
    scoreBadge.classList.add("priority-urgent");
  } else if (priorityScore >= 50) {
    scoreBadge.textContent = "優先";
    scoreBadge.classList.add("priority-high");
  } else {
    scoreBadge.textContent = "通常";
    scoreBadge.classList.add("priority-normal");
  }

  taskInfo.appendChild(scoreBadge);
  scoreBadge.setAttribute("aria-label", `優先度スコア${priorityScore}`);
  const scoreExplanation = document.createElement("small");
  scoreExplanation.textContent = `優先度スコア${priorityScore}。高いほど着手をおすすめします。締切・重要度・残り作業量・進捗から計算する目安で、達成度や本人の評価ではありません。`;
  foldedInfo.appendChild(scoreExplanation);
  if (task.parentId) {
    li.classList.add("subtask-card");
    const quickComplete = document.createElement("button");
    quickComplete.type = "button";
    quickComplete.className = "subtask-complete";
    quickComplete.textContent = "完了";
    quickComplete.setAttribute("aria-label", `${task.title}を完了にする`);
    quickComplete.addEventListener("click", () => completeTask(task.id));
    taskInfo.appendChild(quickComplete);
  }

  // ===== おすすめ開始日を表示 =====

  // ===== 残りの作業日数とおすすめ開始日 =====

  const remainingDays = calculateRemainingDays(task);
  const startDate = calculateStartDate(task);

  const scheduleText = document.createElement("small");
  scheduleText.className = "schedule-text";

  const today = formatDate(new Date());

  if (remainingDays === 0) {
    scheduleText.textContent = "✓ 作業進捗100%（完了操作待ち）";

    scheduleText.classList.add("schedule-finished");
  } else if (startDate === null) {
    scheduleText.textContent = `残り作業目安：${remainingDays}日 | 開始日：未設定`;
  } else if (task.deadline < today) {
    scheduleText.textContent = `⚠ 締切超過 | 残り作業目安：${remainingDays}日`;

    scheduleText.classList.add("schedule-overdue");
  } else if (startDate <= today) {
    scheduleText.textContent = `● 着手おすすめ | 残り${remainingDays}日 | 開始目安：${startDate}`;

    scheduleText.classList.add("schedule-ready");
  } else {
    scheduleText.textContent = `残り作業目安：${remainingDays}日 | おすすめ開始日：${startDate}`;
  }

  foldedInfo.appendChild(scheduleText);
  if (task.plannedDate) {
    const planned = document.createElement("small");
    planned.textContent = `手動予定日：${task.plannedDate}（締切超過時は今日を優先）`;
    foldedInfo.appendChild(planned);
  }

  // 進捗エリア
  const progressContainer = document.createElement("div");
  progressContainer.className = "progress-container";

  const progressLabel = document.createElement("p");
  progressLabel.textContent = "進捗率：" + (task.progress ?? 0) + "%";

  const progressSlider = document.createElement("input");
  progressSlider.type = "range";
  progressSlider.min = "0";
  progressSlider.max = "100";
  progressSlider.step = "10";
  progressSlider.value = task.progress ?? 0;
  progressSlider.setAttribute("aria-label", task.title + "の進捗率");

  progressSlider.addEventListener("input", function () {
    progressLabel.textContent = "進捗率：" + progressSlider.value + "%";
  });

  progressSlider.addEventListener("change", function () {
    updateProgress(task.id, progressSlider.value);
  });

  progressContainer.appendChild(progressLabel);
  progressContainer.appendChild(progressSlider);

  // 完了ボタン
  const completeButton = document.createElement("button");
  completeButton.textContent = "完了";

  completeButton.addEventListener("click", function () {
    completeTask(task.id);
  });

  // 編集ボタン
  const editButton = document.createElement("button");
  editButton.textContent = "編集";
  editButton.className = "edit-button";

  editButton.addEventListener("click", function () {
    editTask(task.id);
  });

  // 削除ボタン
  const deleteButton = document.createElement("button");
  deleteButton.textContent = "削除";
  deleteButton.className = "delete-button";

  deleteButton.addEventListener("click", function () {
    deleteTask(task.id);
  });

  const buttonGroup = document.createElement("div");
  buttonGroup.className = "button-group";

  buttonGroup.appendChild(completeButton);
  buttonGroup.appendChild(editButton);
  buttonGroup.appendChild(deleteButton);
  const planned = task.plannedDate || calculateStartDate(task);
  if ((!task.deadline || task.deadline > formatDate(new Date())) &&
      (planned === null || planned <= formatDate(new Date()))) {
    const migrate = document.createElement("button");
    migrate.type = "button";
    migrate.className = "migrate-button";
    migrate.textContent = "明日へ移行";
    migrate.addEventListener("click", () => migrateTaskToTomorrow(task.id));
    buttonGroup.appendChild(migrate);
  }
  if (canUndoMigration(task)) buttonGroup.appendChild(createUndoMigrationButton(task));

  li.appendChild(taskInfo);
  const metadata = document.createElement("small");
  metadata.className = "card-metadata";
  metadata.textContent = `締切 ${task.deadline || "なし"} ・進捗 ${task.progress ?? 0}%${task.plannedDate ? ` ・予定 ${task.plannedDate}` : ""}`;
  li.appendChild(metadata);
  const controls = document.createElement("details");
  controls.className = "task-accordion";
  controls.open = expandedTaskIds.has(task.id);
  const summary = document.createElement("summary");
  summary.textContent = "詳細・進捗・操作";
  controls.appendChild(summary);
  controls.appendChild(foldedInfo);
  controls.appendChild(progressContainer);
  const addChild = document.createElement("button");
  addChild.type = "button";
  addChild.textContent = "＋ 小さなタスクを追加";
  addChild.addEventListener("click", () => openAddTaskModal(task.id));
  if (!task.parentId) buttonGroup.appendChild(addChild);
  controls.appendChild(buttonGroup);
  controls.addEventListener("toggle", () => {
    // 再描画で切り離された旧カードのtoggleは無視する。
    if (!controls.isConnected) return;
    if (controls.open) expandedTaskIds.add(task.id);
    else expandedTaskIds.delete(task.id);
  });
  li.appendChild(controls);
  if (task.parentId) {
    const parentLabel = document.createElement("small");
    parentLabel.textContent = `大きなタスク：${tasks.find(item => item.id === task.parentId)?.title || "不明"}`;
    li.appendChild(parentLabel);
  } else {
    const children = getVisibleTasks().filter(item => item.parentId === task.id);
    if (children.length) {
      const group = document.createElement("details");
      group.className = "subtask-group";
      group.open = subtaskGroupStates.has(task.id) ? subtaskGroupStates.get(task.id) : !listContext;
      const heading = document.createElement("summary");
      heading.textContent = `小さなタスク ${children.filter(item => item.completed).length}/${children.length}件完了`;
      heading.addEventListener("click", () => subtaskGroupStates.set(task.id, !group.open));
      group.appendChild(heading);
      const list = document.createElement("ul");
      for (const child of children) {
        if (!child.completed) list.appendChild(createTaskCard(child, listContext));
        else {
          const done = document.createElement("li");
          done.textContent = `✓ ${child.title}`;
          list.appendChild(done);
        }
      }
      group.appendChild(list);
      li.appendChild(group);
    }
  }

  return li;
}

/* ===== 達成履歴 ===== */

/* ===== 達成履歴を表示 ===== */

function displayCompletedTasks() {
  completedList.innerHTML = "";

  // 最近完了した順に並べる
  const completedTasks = getVisibleTasks()
    .filter((task) => task.completed)
    .sort((a, b) => {
      const dateA = a.completedAt ? new Date(a.completedAt).getTime() : 0;

      const dateB = b.completedAt ? new Date(b.completedAt).getTime() : 0;

      return dateB - dateA;
    });

  // 表示するタスクを決める
  const visibleTasks = showAllCompleted
    ? completedTasks
    : completedTasks.slice(0, MAX_VISIBLE_COMPLETED);

  if (completedTasks.length === 0) {
    const li = document.createElement("li");
    li.className = "completed-empty";
    li.textContent = "まだ達成履歴はありません。";
    completedList.appendChild(li);
  }

  visibleTasks.forEach(function (task) {
    const li = document.createElement("li");
    li.className = "completed-item";

    const title = document.createElement("strong");
    title.textContent = "✓ " + task.title;

    const date = document.createElement("small");
    date.textContent = task.completedAt
      ? new Date(task.completedAt).toLocaleString("ja-JP")
      : "完了日時：不明";

    li.appendChild(title);
    li.appendChild(date);
    const reopen = document.createElement("button");
    reopen.type = "button";
    reopen.textContent = "未完了に戻す";
    reopen.addEventListener("click", () => {
      restoreIncompleteTask(task);
      const parent = tasks.find(item => item.id === task.parentId);
      if (parent?.completed) restoreIncompleteTask(parent);
      if (saveTasks()) displayTasks();
    });
    li.appendChild(reopen);

    completedList.appendChild(li);
  });

  // 5件を超えた場合だけボタンを表示
  viewAllCompletedButton.hidden =
    completedTasks.length <= MAX_VISIBLE_COMPLETED;

  viewAllCompletedButton.textContent = showAllCompleted
    ? "最新4件だけ表示"
    : "すべての達成タスクを見る";
}

/* ===== 達成履歴の表示切り替え ===== */

viewAllCompletedButton.addEventListener("click", function () {
  showAllCompleted = !showAllCompleted;

  displayCompletedTasks();
});

/* ===== タスクの移行 ===== */
function restoreIncompleteTask(task) {
  task.completed = false;
  task.completedAt = null;
  // 旧版で完了したタスクは元の値がないので、保存済みの進捗を維持する。
  if (task.progressBeforeCompletion != null) task.progress = task.progressBeforeCompletion;
  delete task.progressBeforeCompletion;
}

function migrateTaskToTomorrow(id) {
  const task = tasks.find((task) => task.id === id);

  if (!task || task.completed) {
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = addDays(today, 1);

  // 次に取り組む予定日を明日に設定
  if (task.plannedDate === formatDate(tomorrow)) return;
  task.migrationUndo = {
    plannedDate: task.plannedDate ?? null,
    migrationCount: task.migrationCount ?? 0,
    targetDate: formatDate(tomorrow),
  };
  task.plannedDate = formatDate(tomorrow);

  // 移行した回数を記録
  task.migrationCount = (task.migrationCount ?? 0) + 1;

  saveTasks();
  displayTasks();
}

function canUndoMigration(task) {
  return !task.completed && task.migrationUndo != null &&
    task.plannedDate === task.migrationUndo.targetDate &&
    task.migrationCount === task.migrationUndo.migrationCount + 1;
}

function undoTaskMigration(id) {
  const task = tasks.find(task => task.id === id);
  if (!task || !canUndoMigration(task)) return;
  task.plannedDate = task.migrationUndo.plannedDate;
  task.migrationCount = task.migrationUndo.migrationCount;
  delete task.migrationUndo;
  if (saveTasks()) displayTasks();
}

function createUndoMigrationButton(task) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "migrate-button";
  button.textContent = "移行を取り消す";
  button.setAttribute("aria-label", `${task.title}の明日への移行を取り消す`);
  button.addEventListener("click", () => undoTaskMigration(task.id));
  return button;
}

/* ===== 今日・明日・今週の分類 ===== */

/* ===== 今日・明日・今週の分類 ===== */

function categorizeTasksByDate() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = addDays(today, 1);

  // 今週の日曜日
  const endOfWeek = addDays(today, (7 - today.getDay()) % 7);

  const todayText = formatDate(today);
  const tomorrowText = formatDate(tomorrow);
  const endOfWeekText = formatDate(endOfWeek);

  const result = {
    today: [],
    tomorrow: [],
    week: [],
    suggestions: [],
  };
  const unscheduled = [];

  const activeTasks = getVisibleTasks().filter((task) => !task.completed);

  activeTasks.forEach(function (task) {
    if (!task.deadline && !task.plannedDate) {
      unscheduled.push(task);
      return;
    }
    // 手動で移行した予定日があれば優先する
    const startDate = task.plannedDate || calculateStartDate(task);

    if (startDate === null) {
      result.today.push(task);
      return;
    }

    // 締切超過の場合は移行先より今日を優先
    if (task.deadline && task.deadline < todayText) {
      result.today.push(task);
    } else if (startDate <= todayText) {
      result.today.push(task);
    } else if (startDate === tomorrowText) {
      result.tomorrow.push(task);
    } else if (startDate > tomorrowText && startDate <= endOfWeekText) {
      result.week.push(task);
    }
  });

  const available = Math.max(0, 3 - result.today.length);
  result.suggestions = sortByRecommendation(unscheduled).slice(0, available);
  return result;
}

/* ===== デイリーレビュー表示 ===== */

function displayDailyReview() {
  const today = formatDate(new Date());

  // 今日完了したタスク
  const completedToday = getVisibleTasks().filter(function (task) {
    if (!task.completed || !task.completedAt) {
      return false;
    }

    const completedDate = formatDate(new Date(task.completedAt));

    return completedDate === today;
  });

  // 今日残っているタスク
  const categorized = categorizeTasksByDate();
  const remainingToday = sortByRecommendation(categorized.today);

  // 件数
  reviewCompletedCount.textContent = `${completedToday.length}件`;

  reviewRemainingCount.textContent = `${remainingToday.length}件`;

  // リスト初期化
  reviewCompletedList.innerHTML = "";
  reviewRemainingList.innerHTML = "";

  // 完了したタスク
  completedToday.forEach(function (task) {
    const li = document.createElement("li");
    li.className = "review-completed-item";
    li.textContent = `✓ ${task.title}`;

    reviewCompletedList.appendChild(li);
  });

  // 残っているタスク
  remainingToday.forEach(function (task) {
    const li = document.createElement("li");
    li.className = "review-remaining-item";

    const title = document.createElement("span");
    title.textContent = task.title;

    li.appendChild(title);

    // 締切が今日より先なら移行できる
    const canMigrate = !task.deadline || task.deadline > today;

    if (canMigrate) {
      const button = document.createElement("button");

      button.textContent = "明日へ移行";
      button.className = "migrate-button";

      button.addEventListener("click", function () {
        migrateTaskToTomorrow(task.id);
      });

      li.appendChild(button);
    }

    reviewRemainingList.appendChild(li);
  });

  reviewCompletedEmpty.hidden = completedToday.length !== 0;

  reviewRemainingEmpty.hidden = remainingToday.length !== 0;
}

/* ===== 振り返りメモの保存 ===== */

saveReviewButton.addEventListener("click", function () {
  const today = formatDate(new Date());

  dailyReviews[reviewDate] = {
    memo: reviewMemo.value.trim(),
  };

  if (!saveDailyReviews()) return;
  reviewDirty = false;
  if (reviewDate !== formatDate(new Date())) {
    loadTodayReview();
    displayTasks();
  }

  reviewSaveMessage.hidden = false;
});

/* ===== 今日のメモを読み込む ===== */

function loadTodayReview() {
  const today = formatDate(new Date());
  reviewDate = today;
  reviewDirty = false;
  document.getElementById("reviewDate").textContent = `${reviewDate} の振り返り`;

  const review = dailyReviews[today];

  reviewMemo.value = review ? review.memo : "";

  reviewSaveMessage.hidden = true;
}

/* ===== 今日のプランを表示 ===== */

function displayDailyPlan() {
  const categorized = categorizeTasksByDate();

  const todayTasks = sortByRecommendation(categorized.today);
  const tomorrowTasks = sortByRecommendation(categorized.tomorrow);
  const weekTasks = sortByRecommendation(categorized.week);

  // 件数表示
  todayCount.textContent = `${todayTasks.length}件`;
  tomorrowCount.textContent = `${tomorrowTasks.length}件`;
  weekCount.textContent = `${weekTasks.length}件`;

  // リストを初期化
  todayTaskList.innerHTML = "";
  tomorrowTaskList.innerHTML = "";
  weekTaskList.innerHTML = "";

  // 今日のタスク
  (showAllToday ? todayTasks : todayTasks.slice(0, 3)).forEach(task => {
    todayTaskList.appendChild(createDailyTaskItem(task, false, true));
  });
  const suggestions = document.getElementById("suggestedTaskList");
  suggestions.innerHTML = "";
  categorized.suggestions.forEach(task => suggestions.appendChild(createDailyTaskItem(task, true, true)));
  document.getElementById("suggestedTasksSection").hidden = categorized.suggestions.length === 0;
  document.getElementById("suggestedTasksCount").textContent = `${categorized.suggestions.length}件`;
  const more = document.getElementById("showMoreTodayButton");
  more.hidden = todayTasks.length <= 3;
  more.textContent = showAllToday ? "最初の3件だけ表示" : `残り${todayTasks.length - 3}件を表示`;
  more.setAttribute("aria-expanded", String(showAllToday));

  // 明日のタスク
  tomorrowTasks.forEach(function (task) {
    tomorrowTaskList.appendChild(createDailyTaskItem(task));
  });

  // 今週のタスク
  weekTasks.forEach(function (task) {
    weekTaskList.appendChild(createDailyTaskItem(task));
  });

  todayEmptyMessage.hidden = todayTasks.length !== 0;
}

/* ===== 今日のプラン用の小さなカード ===== */

/* ===== 今日のプラン用カード ===== */

/* ===== 指定したタスクカードへ移動 ===== */

function jumpToTaskCard(id) {
  pendingJumpId = id;
  const changedConditions = Boolean(taskSearch.value || taskFilter.value !== "all" || selectedDeadlineBucket);
  expandedTaskIds.add(id);
  const requestedTask = tasks.find(task => task.id === id);
  if (requestedTask?.parentId) subtaskGroupStates.set(requestedTask.parentId, true);
  else if (tasks.some(task => task.parentId === id)) subtaskGroupStates.set(id, true);
  if (requestedTask && !getVisibleTasks().some(task => task.id === id)) {
    selectedCategory = "";
    refreshCategoryOptions();
    notifyStorage("対象タスクを表示するため、分類を「すべて」に変更しました。");
  }
  if (changedConditions) notifyStorage("対象タスクを表示するため、検索と締切の絞り込みを解除しました。");
  // 全タスク画面へ切り替える
  showScreen("all");

  // 検索や絞り込みを解除する
  taskSearch.value = "";
  taskFilter.value = "all";
  selectedDeadlineBucket = "";
  // 表示中の分類は維持する。

  // タスク一覧を再描画
  displayAllTasks();

  // 該当するタスクカードを探す
  const cards = allTasksList.querySelectorAll("[data-task-id]");

  const target = Array.from(cards).find((card) => card.dataset.taskId === id);

  if (!target) {
    return;
  }
  for (let ancestor = target.parentElement; ancestor && ancestor !== allTasksList; ancestor = ancestor.parentElement) {
    if (ancestor.tagName === "DETAILS") ancestor.open = true;
  }
  target.tabIndex = -1;
  target.focus({ preventScroll: true });

  // 該当カードまで移動
  target.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });

  // 移動先を強調
  target.classList.remove("task-highlight");
  void target.offsetWidth;
  target.classList.add("task-highlight");
}

function createDailyTaskItem(task, isSuggestion = false, compact = false) {
  const li = document.createElement("li");
  li.className = "daily-task-item";

  // タスクカードをクリックすると詳細へ移動
  li.classList.add("daily-task-clickable");
  if (!compact) {
    li.tabIndex = 0;
    li.setAttribute("role", "button");
  }

  li.addEventListener("click", function (event) {
    // 移行ボタンを押したときは移動しない
    if (event.target.closest("button")) {
      return;
    }

    jumpToTaskCard(task.id);
  });

  // Enterキーでも移動できる
  li.addEventListener("keydown", function (event) {
    if (event.target !== li) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      jumpToTaskCard(task.id);
    }
  });

  const info = document.createElement("div");
  info.className = "daily-task-info";

  const title = document.createElement("strong");
  title.textContent = task.title;

  const details = document.createElement("small");
  details.textContent = `締切：${task.deadline || "なし"} | 予定日：${task.plannedDate || "自動"} | 進捗：${task.progress ?? 0}%${task.category ? ` | ${task.category}` : ""}`;

  info.appendChild(title);
  info.appendChild(details);
  if (isSuggestion) {
    const hint = document.createElement("small");
    hint.className = "suggestion-label";
    hint.textContent = "余裕があれば";
    info.appendChild(hint);
  }

  // 優先スコア
  const score = document.createElement("span");
  score.className = "daily-score";
  const points = calculatePriorityScore(task);
  score.textContent = compact ? (points >= 75 ? "最優先" : points >= 50 ? "優先" : "通常") : `優先度スコア${points}`;
  if (compact) {
    score.classList.add(points >= 75 ? "score-urgent" : points >= 50 ? "score-high" : "score-normal");
    score.setAttribute("aria-label", `優先スコア${points}点`);
  }

  // 操作エリア
  const actions = document.createElement("div");
  actions.className = "daily-task-actions";

  actions.appendChild(score);
  if (!compact && canUndoMigration(task)) actions.appendChild(createUndoMigrationButton(task));

  // 今日のタスクにだけ移行ボタンを表示
  const todayText = formatDate(new Date());

  const plannedDate = task.plannedDate || calculateStartDate(task);

  const isTodayTask = plannedDate === null || plannedDate <= todayText;

  // 締切が今日以前なら明日へ移行できない
  const canMigrate = !task.deadline || task.deadline > todayText;

  if (!compact && isTodayTask && canMigrate) {
    const migrateButton = document.createElement("button");

    migrateButton.textContent = "明日へ移行";
    migrateButton.className = "migrate-button";

    migrateButton.addEventListener("click", function () {
      migrateTaskToTomorrow(task.id);
    });

    actions.appendChild(migrateButton);
  }

  if (compact) {
    const arrow = document.createElement("span");
    arrow.textContent = "›";
    arrow.className = "today-chevron";
    arrow.setAttribute("aria-hidden", "true");
    actions.appendChild(arrow);
    const open = document.createElement("button");
    open.type = "button";
    open.className = "today-open";
    open.setAttribute("aria-label", `${task.title}の詳細を開く`);
    open.appendChild(info);
    open.appendChild(actions);
    open.addEventListener("click", () => jumpToTaskCard(task.id));
    li.appendChild(open);
  } else {
    li.appendChild(info);
    li.appendChild(actions);
  }

  return li;
}

/* ===== ホーム画面のタスク ===== */

function displayHomeTasks() {
  taskList.innerHTML = "";

  const activeTasks = getVisibleTasks().filter((task) => !task.completed);
  const sortedTasks = sortByDeadline(activeTasks);

  taskCount.textContent = `（${selectedCategory ? "選択分類" : "全体"}${activeTasks.length}件）`;

  const visible = sortedTasks.slice(0, MAX_VISIBLE_TASKS);
  visible.filter(task => !task.parentId || !visible.some(parent => parent.id === task.parentId)).forEach(function (task) {
    taskList.appendChild(createTaskCard(task));
  });

  viewAllButton.hidden = activeTasks.length === 0;

  viewAllButton.textContent = `すべてのタスクを見る（${activeTasks.length}件）`;
}

/* ===== すべてのタスク画面 ===== */

function displayAllTasks() {
  allTasksList.innerHTML = "";

  const activeTasks = getVisibleTasks().filter((task) => !task.completed);

  const keyword = taskSearch.value.trim().toLowerCase();
  const filterType = taskFilter.value;
  const sortType = taskSort.value;
  const deadlineMatches = selectedDeadlineBucket
    ? new Set(getDeadlineTasks().filter(task => getDeadlineBucket(task) === selectedDeadlineBucket).map(task => task.id)) : null;

  let filteredTasks = activeTasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(keyword);

    let matchesFilter = true;

    if (filterType === "hasDeadline") {
      matchesFilter = Boolean(task.deadline);
    }

    if (filterType === "noDeadline") {
      matchesFilter = !task.deadline;
    }

    const matchesDeadline = !deadlineMatches || deadlineMatches.has(task.id);
    return matchesSearch && matchesFilter && matchesDeadline;
  });

  filteredTasks = sortTasks(filteredTasks, sortType);

  const signature = JSON.stringify([selectedCategory, keyword, filterType, sortType, selectedDeadlineBucket]);
  if (signature !== listSignature) {
    listPage = 0;
    selectedTaskIds.clear();
    listSignature = signature;
  }
  const rows = filteredTasks.filter(task => !task.parentId || !filteredTasks.some(parent => parent.id === task.parentId));
  if (pendingJumpId) {
    const requested = tasks.find(task => task.id === pendingJumpId);
    const index = rows.findIndex(task => task.id === pendingJumpId || task.id === requested?.parentId);
    if (index >= 0) listPage = Math.floor(index / LIST_PAGE_SIZE);
    pendingJumpId = null;
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / LIST_PAGE_SIZE));
  listPage = Math.min(listPage, totalPages - 1);
  const visibleRows = rows.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE);
  pageTaskIds = visibleRows.map(task => task.id);
  for (const id of selectedTaskIds) {
    if (!pageTaskIds.includes(id)) selectedTaskIds.delete(id);
  }

  const totalActive = tasks.filter(task => !task.completed).length;
  const scope = selectedCategory ? `分類「${selectedCategory === "__uncategorized" ? "未分類" : selectedCategory.slice(9)}」` : "全分類";
  const grouped = rows.length !== filteredTasks.length;
  const unit = grouped ? "組" : "件";
  const prefix = selectedCategory || keyword || filterType !== "all" || selectedDeadlineBucket ? "対象" : "全";
  allTasksCount.textContent = rows.length
    ? `${prefix}${rows.length}${unit}中 ${listPage * LIST_PAGE_SIZE + 1}〜${listPage * LIST_PAGE_SIZE + visibleRows.length}${unit}` : `${prefix}0件`;
  document.getElementById("allTasksCountDetails").textContent = `検索・絞り込み後${filteredTasks.length}タスク / ${scope}${activeTasks.length}件 / 全体${totalActive}件（未完了）。${grouped ? "親と子を同じカードにまとめているため、ページはまとまり（組）で数えます。" : "ページは表示するタスク数で数えます。"}親カード内の子は自動選択しません。`;

  visibleRows.forEach(function (task) {
    const card = createTaskCard(task, true);
    if (selectionMode) {
      const label = document.createElement("label");
      label.className = "task-selection";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedTaskIds.has(task.id);
      card.classList.toggle("task-selected", checkbox.checked);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedTaskIds.add(task.id);
        else selectedTaskIds.delete(task.id);
        card.classList.toggle("task-selected", checkbox.checked);
        updateSelectionStatus();
      });
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(`「${task.title}」を選択（子は自動選択しません）`));
      card.prepend(label);
    }
    allTasksList.appendChild(card);
  });
  allTasksList.classList.add("compact-list");
  document.getElementById("previousPage").disabled = listPage === 0;
  document.getElementById("nextPage").disabled = listPage >= totalPages - 1;
  document.getElementById("pageStatus").textContent = `${listPage + 1} / ${totalPages}ページ・1ページ最大20件`;
  document.getElementById("previousPageTop").disabled = listPage === 0;
  document.getElementById("nextPageTop").disabled = listPage >= totalPages - 1;
  const pageText = `${listPage + 1} / ${totalPages}`;
  document.getElementById("pageStatus").textContent = pageText;
  document.getElementById("pageStatusTop").textContent = pageText;
  updateSelectionStatus();

  emptyTaskMessage.hidden = filteredTasks.length !== 0;
  document.getElementById("clearDeadlineFilter").hidden = !selectedDeadlineBucket;
  const status = document.getElementById("deadlineFilterStatus");
  status.hidden = !selectedDeadlineBucket;
  status.textContent = selectedDeadlineBucket ? `締切：${deadlineBucketLabels[selectedDeadlineBucket]}（子は必要に応じて親の締切で集計）` : "";
}

/* ===== 全体の表示更新 ===== */

function displayTasks() {
  const savedScroll = currentScreen === "all" ? window.scrollY : null;
  if (lastCompletion && !getCompletionUndoTargets().length) {
    hideCompletionUndo();
  } else if (lastCompletion?.bulk) {
    document.getElementById("completionUndoMessage").textContent = `${getCompletionUndoTargets().length}件の完了をまとめて元に戻せます。`;
  }
  refreshCategoryOptions();
  populateParentOptions(parentInput, null, parentInput.value);
  displayHomeTasks();
  displayAllTasks();
  displayCompletedTasks();
  displayDailyPlan();
  displayDailyReview();
  displayDeadlineChart();
  if (savedScroll != null) window.scrollTo(0, savedScroll);
}

const deadlineBucketLabels = {
  overdue: "期限切れ", today: "今日", tomorrow: "明日",
  week: "今週の残り", later: "それ以降", none: "締切なし",
};
function getDeadlineTasks() {
  const parentIds = new Set(tasks.map(task => task.parentId).filter(Boolean));
  return getVisibleTasks().filter(task => !task.completed && !parentIds.has(task.id));
}
function getDeadlineBucket(task, now = new Date()) {
  const deadline = task.deadline || tasks.find(parent => parent.id === task.parentId)?.deadline;
  if (!deadline) return "none";
  const today = formatDate(now);
  if (deadline < today) return "overdue";
  if (deadline === today) return "today";
  if (deadline === formatDate(addDays(now, 1))) return "tomorrow";
  const end = formatDate(addDays(now, (7 - now.getDay()) % 7));
  return deadline <= end ? "week" : "later";
}
function displayDeadlineChart() {
  const items = getDeadlineTasks();
  const counts = Object.fromEntries(Object.keys(deadlineBucketLabels).map(key => [key, 0]));
  items.forEach(task => counts[getDeadlineBucket(task)]++);
  const chart = document.getElementById("deadlineChart");
  chart.innerHTML = "";
  const largest = Math.max(1, ...Object.values(counts));
  const now = new Date();
  document.getElementById("deadlineChartSummary").textContent = `${formatDate(now)} 時点・未完了${items.length}件${selectedCategory ? "（選択中の分類）" : ""}`;
  for (const [key, label] of Object.entries(deadlineBucketLabels)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `deadline-chart-row deadline-${key}`;
    button.disabled = counts[key] === 0;
    button.setAttribute("aria-label", `${label}が締切のタスク${counts[key]}件を表示`);
    const name = document.createElement("span");
    name.className = "chart-label";
    name.textContent = label;
    const track = document.createElement("span");
    track.className = "chart-track";
    track.setAttribute("aria-hidden", "true");
    const bar = document.createElement("span");
    bar.className = "chart-bar";
    bar.style.width = `${counts[key] / largest * 100}%`;
    track.appendChild(bar);
    const count = document.createElement("span");
    count.className = "chart-count";
    count.textContent = `${counts[key]}件`;
    button.appendChild(name); button.appendChild(track); button.appendChild(count);
    button.addEventListener("click", () => {
      selectedDeadlineBucket = key;
      taskSearch.value = "";
      taskFilter.value = "all";
      displayAllTasks();
      showScreen("all");
    });
    chart.appendChild(button);
  }
}
document.getElementById("showMoreTodayButton").addEventListener("click", () => {
  showAllToday = !showAllToday;
  displayDailyPlan();
});
document.getElementById("clearDeadlineFilter").addEventListener("click", () => {
  selectedDeadlineBucket = "";
  displayAllTasks();
});

function getVisibleTasks() {
  const selected = selectedCategory;
  return tasks.filter(task => !selected || (selected === "__uncategorized"
    ? !task.category : `category:${task.category}` === selected));
}

function refreshCategoryOptions() {
  const selected = selectedCategory;
  const categories = [...new Set(tasks.map(task => task.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
  selectedCategory = selected === "__uncategorized" || categories.some(name => `category:${name}` === selected) ? selected : "";
  const tabs = document.getElementById("categoryTabs");
  const listCategory = document.getElementById("listCategorySelect");
  listCategory.innerHTML = "";
  const hadFocus = tabs.contains(document.activeElement);
  tabs.innerHTML = "";
  for (const [value, label] of [["", "すべて"], ["__uncategorized", "未分類"], ...categories.map(name => [`category:${name}`, name])]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    listCategory.appendChild(option);
    const button = document.createElement("button");
    button.type = "button";
    const name = document.createElement("span");
    name.textContent = label;
    const count = document.createElement("span");
    count.className = "menu-category-count";
    count.textContent = `${tasks.filter(task => !task.completed && (!value || (value === "__uncategorized" ? !task.category : `category:${task.category}` === value))).length}件`;
    button.appendChild(name);
    button.appendChild(count);
    button.setAttribute("aria-label", `${label}、未完了${count.textContent}`);
    button.className = "category-tab";
    button.setAttribute("aria-pressed", String(value === selectedCategory));
    button.addEventListener("click", () => {
      selectedCategory = value;
      displayTasks();
      taskMenu.close();
    });
    tabs.appendChild(button);
    if (hadFocus && value === selectedCategory) button.focus();
  }
  listCategory.value = selectedCategory;
  const options = document.getElementById("categoryOptions");
  options.innerHTML = "";
  for (const name of new Set(["大学", "仕事", "私生活", "生活", ...categories])) {
    const option = document.createElement("option");
    option.value = name;
    options.appendChild(option);
  }
  for (const [containerId, input] of [["categorySuggestions", categoryInput], ["editCategorySuggestions", editCategoryInput]]) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    for (const name of categories) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "category-suggestion";
      button.textContent = name;
      button.addEventListener("click", () => {
        input.value = name;
        input.focus();
      });
      container.appendChild(button);
    }
  }
  document.getElementById("categoryStatus").textContent = selectedCategory
    ? `「${selectedCategory === "__uncategorized" ? "未分類" : selectedCategory.slice(9)}」のタスクを表示中。振り返りメモとバックアップは全分類共通です。`
    : "すべての分類を表示中";
  document.getElementById("homeCategoryNotice").hidden = !selectedCategory;
  document.getElementById("homeCategoryLabel").textContent = selectedCategory
    ? `「${selectedCategory === "__uncategorized" ? "未分類" : selectedCategory.slice(9)}」のみ表示中` : "";
  document.getElementById("allCategoryNotice").hidden = !selectedCategory;
  document.getElementById("allCategoryLabel").textContent = document.getElementById("homeCategoryLabel").textContent;
}

/* ===== 画面切り替え ===== */

function showScreen(screen) {
  if (!["home", "all", "backup"].includes(screen)) return;
  currentScreen = screen;

  homeScreen.hidden = screen !== "home";
  allTasksScreen.hidden = screen !== "all";
  backupScreen.hidden = screen !== "backup";
  for (const button of document.querySelectorAll(".bottom-nav [data-screen]")) {
    if (button.dataset.screen === screen) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }

  window.scrollTo(0, 0);
}

viewAllButton.addEventListener("click", function () {
  showScreen("all");
});

backButton.addEventListener("click", function () {
  showScreen("home");
});

/* ===== 検索・並び替え・絞り込み ===== */

taskSearch.addEventListener("input", displayAllTasks);
taskSort.addEventListener("change", displayAllTasks);
taskFilter.addEventListener("change", displayAllTasks);

/* ===== 初期表示 ===== */

function createTaskId() {
  let id;
  do { id = `task-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  while (tasks.some(task => task.id === id));
  return id;
}

let modalReturnFocus = null;
function closeEditModal() {
  editModal.hidden = true;
  editingTaskId = null;
  setEditBackgroundInert(false);
  document.body.classList.remove("modal-open");
  if (modalReturnFocus?.isConnected) modalReturnFocus.focus();
  else document.getElementById("openAddButton").focus();
}
editModal.addEventListener("keydown", event => {
  if (event.key === "Escape") closeEditModal();
  if (event.key !== "Tab") return;
  const fields = Array.from(editModal.querySelectorAll("input:not(:disabled), select:not(:disabled), button:not(:disabled)"));
  const first = fields[0], last = fields[fields.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
});

reviewMemo.addEventListener("input", () => {
  reviewDirty = true;
  reviewSaveMessage.hidden = true;
});
function refreshDay() {
  if (reviewDate === formatDate(new Date())) return;
  if (!reviewDirty) loadTodayReview();
  else document.getElementById("reviewDate").textContent = `${reviewDate} の未保存メモです。保存後に今日へ切り替わります。`;
  displayTasks();
}
window.addEventListener("focus", refreshDay);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshDay();
});
setInterval(refreshDay, 30000);
window.addEventListener("beforeunload", event => {
  if (reviewDirty) { event.preventDefault(); event.returnValue = ""; }
});

let preparedBackup = null;
// アプリ内ブラウザーの検出は補助。検出されない環境にも文章コピーを用意する。
const isLineBrowser = /\bLine\//i.test(navigator.userAgent || "");
function backupFileName(data) {
  return `TaskFlow-${data.exportedAt.replace(/[:.]/g, "-")}.json`;
}
function makeBackupFile(data) {
  return new File([JSON.stringify(data, null, 2)], backupFileName(data), { type: "application/json" });
}
document.getElementById("exportButton").addEventListener("click", () => {
  if (storageBlocked) {
    notifyStorage("読み込めなかったデータは復元前に退避します。空のバックアップは出力しません。");
    return;
  }
  const reviews = { ...dailyReviews };
  if (reviewDirty) reviews[reviewDate] = { memo: reviewMemo.value.trim() };
  // プレビュー時点の内容を固定し、表示件数と書き出す内容を一致させる。
  preparedBackup = JSON.parse(JSON.stringify({ app: "TaskFlow", version: 1, exportedAt: new Date().toISOString(), tasks, dailyReviews: reviews }));
  document.getElementById("backupPreview").hidden = false;
  document.getElementById("exportButton").setAttribute("aria-expanded", "true");
  document.getElementById("backupSummary").textContent = `${new Date(preparedBackup.exportedAt).toLocaleString("ja-JP")} 時点：全分類のタスク${tasks.length}件、振り返り${Object.keys(reviews).length}日分。未保存の振り返りメモも含みます。`;
  const preview = document.getElementById("backupTaskPreview");
  preview.innerHTML = "";
  for (const task of preparedBackup.tasks.slice(0, 20)) {
    const item = document.createElement("li");
    item.textContent = `${task.completed ? "完了" : "未完了"}：${task.title}${task.category ? `（${task.category}）` : ""}`;
    preview.appendChild(item);
  }
  if (tasks.length > 20) {
    const more = document.createElement("li");
    more.textContent = `ほか${tasks.length - 20}件（ファイルには全件保存します）`;
    preview.appendChild(more);
  }
  let canShare = false;
  try { canShare = Boolean(navigator.share && navigator.canShare?.({ files: [makeBackupFile(preparedBackup)] })); } catch (_) { /* ダウンロードを案内 */ }
  document.getElementById("shareBackupButton").hidden = isLineBrowser || !canShare;
  document.getElementById("downloadBackupButton").hidden = isLineBrowser;
  document.getElementById("lineBackupNotice").hidden = !isLineBrowser;
  document.getElementById("backupTextDetails").open = isLineBrowser;
  document.getElementById("backupText").value = JSON.stringify(preparedBackup, null, 2);
  document.getElementById("backupSaveStatus").textContent = isLineBrowser
    ? "LINE内で開いています。まずバックアップ全文をコピーしてください。コピーだけではファイル保存は完了しません。"
    : "まだファイルには保存していません。下の保存方法を選んでください。";
});
document.getElementById("closeBackupButton").addEventListener("click", () => {
  document.getElementById("backupPreview").hidden = true;
  document.getElementById("exportButton").setAttribute("aria-expanded", "false");
  preparedBackup = null;
  document.getElementById("backupText").value = "";
  document.getElementById("exportButton").focus();
});
document.getElementById("downloadBackupButton").addEventListener("click", () => {
  if (!preparedBackup || isLineBrowser) return;
  const status = document.getElementById("backupSaveStatus");
  try {
    const file = makeBackupFile(preparedBackup);
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    status.textContent = `ダウンロードを開始しました。保存完了はアプリから確認できません。「ファイル」などの保存先に ${file.name} があるか確認してください。`;
  } catch (_) {
    status.textContent = "ファイルを作成できませんでした。Safariで開き直すか、共有メニューからの保存を試してください。";
  }
});
document.getElementById("shareBackupButton").addEventListener("click", async () => {
  if (!preparedBackup || isLineBrowser) return;
  const status = document.getElementById("backupSaveStatus");
  try {
    await navigator.share({ files: [makeBackupFile(preparedBackup)] });
    status.textContent = "共有操作が終了しました。「ファイルに保存」を選んだ場合は、ファイルアプリで保存を確認してください。";
  } catch (error) {
    status.textContent = error.name === "AbortError"
      ? "保存・共有をキャンセルしました。もう一度保存方法を選べます。"
      : "共有メニューを開けませんでした。「ファイルをダウンロード」を試すか、Safariで開き直してください。";
  }
});
document.getElementById("copyBackupButton").addEventListener("click", async () => {
  if (!preparedBackup) return;
  const text = document.getElementById("backupText");
  const status = document.getElementById("backupSaveStatus");
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(text.value);
    status.textContent = "バックアップ全文をコピーしました。メモアプリへ貼り付けて保管するか、移動先のTaskFlowで文章から復元してください。まだファイル保存はしていません。";
  } catch (_) {
    text.focus();
    text.select();
    text.setSelectionRange(0, text.value.length);
    status.textContent = "自動コピーできませんでした。文章欄を長押しし、全選択してコピーしてください。全文がコピーできたことを貼り付け先で確認してください。";
  }
});
const importFile = document.getElementById("importFile");
document.getElementById("importButton").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  importFile.value = "";
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("ファイルは5MB以下にしてください。");
    restoreBackupText(await file.text());
  } catch (error) {
    notifyStorage(`ファイルを読み込めませんでした。現在のデータは変更していません。${error.message}`);
  }
});
document.getElementById("importTextButton").addEventListener("click", () => {
  if (restoreBackupText(document.getElementById("importBackupText").value)) {
    document.getElementById("importBackupText").value = "";
  }
});
function restoreBackupText(text) {
  try {
    if (new Blob([text]).size > 5 * 1024 * 1024) throw new Error("バックアップは5MB以下にしてください。");
    const data = JSON.parse(text);
    if (data.app !== "TaskFlow" || data.version !== 1) throw new Error("対応するTaskFlowのバックアップではありません。");
    validateData(data);
    if (!confirm(`タスク${data.tasks.length}件、振り返り${Object.keys(data.dailyReviews).length}日分を復元します。現在の全データと未保存メモを置き換えますか？`)) return;
    // 元の文字列をそのまま退避。退避に失敗したら復元しない。
    localStorage.setItem("taskflowBeforeRestore", JSON.stringify({
      savedAt: new Date().toISOString(),
      current: localStorage.getItem(STORAGE_KEY),
      legacyTasks: localStorage.getItem("tasks"),
      legacyReviews: localStorage.getItem("dailyReviews"),
      reviewDate, unsavedMemo: reviewDirty ? reviewMemo.value : null,
    }));
    const serialized = JSON.stringify({ app: "TaskFlow", version: 1, tasks: data.tasks, dailyReviews: data.dailyReviews });
    localStorage.setItem(STORAGE_KEY, serialized);
    lastStoredValue = serialized;
    tasks = data.tasks;
    dailyReviews = data.dailyReviews;
    savedSnapshot = JSON.stringify({ tasks, dailyReviews });
    storageBlocked = false;
    loadTodayReview();
    displayTasks();
    notifyStorage("バックアップを復元しました。復元前のデータはブラウザー内に退避しています。");
    return true;
  } catch (error) {
    notifyStorage(`復元できませんでした。現在のデータは変更していません。${error.message}`);
    return false;
  }
}

// ホームは画面幅によらず今日のタスクを先頭にする。
document.getElementById("mobileCompletedSlot").appendChild(document.getElementById("completedPanel"));

function setEditBackgroundInert(value) {
  for (const selector of ["main", ".app-header", ".bottom-nav", ".completion-undo"]) {
    document.querySelector(selector).inert = value;
  }
}
function populateParentOptions(select, editingId, selected = "") {
  const query = document.getElementById(select === parentInput ? "parentSearch" : "editParentSearch").value.trim().toLowerCase();
  const editingTask = tasks.find(task => task.id === editingId);
  const hasChildren = editingId != null && tasks.some(task => task.parentId === editingId);
  select.innerHTML = "";
  const independent = document.createElement("option");
  independent.value = "";
  independent.textContent = "独立したタスク";
  select.appendChild(independent);
  if (!hasChildren) {
    for (const task of tasks.filter(task => !task.parentId && !task.completed && task.id !== editingId &&
      (task.id === selected || task.title.toLowerCase().includes(query)))) {
      const option = document.createElement("option");
      option.value = task.id;
      option.textContent = task.title;
      select.appendChild(option);
    }
  }
  // 完了済みの親との既存の関係は編集で勝手に外さない。
  const oldParent = tasks.find(task => task.id === editingTask?.parentId);
  if (oldParent?.completed) {
    const option = document.createElement("option");
    option.value = oldParent.id;
    option.textContent = `${oldParent.title}（完了済み）`;
    select.appendChild(option);
  }
  select.value = selected;
  if (select.selectedIndex === -1) select.value = "";
}
function openAddTaskModal(parentId = null) {
  document.getElementById("parentSearch").value = "";
  document.getElementById("addTaskMessage").hidden = true;
  const parent = tasks.find(task => task.id === parentId && !task.completed && !task.parentId);
  populateParentOptions(parentInput, null, parent?.id || "");
  if (parent) categoryInput.value = parent.category || "";
  if (parent) document.getElementById("addTaskAdvanced").open = true;
  if (taskMenu.open) taskMenu.close();
  addTaskModal.showModal();
  taskInput.focus();
}

document.getElementById("clearHomeCategory").addEventListener("click", () => {
  selectedCategory = "";
  displayTasks();
});
document.getElementById("clearAllCategory").addEventListener("click", () => {
  selectedCategory = "";
  displayTasks();
});
for (const [id, select, getEditingId] of [["parentSearch", parentInput, () => null], ["editParentSearch", editParentInput, () => editingTaskId]]) {
  document.getElementById(id).addEventListener("input", () => populateParentOptions(select, getEditingId(), select.value));
}
function updateSelectionStatus() {
  document.getElementById("bulkActions").hidden = !selectionMode;
  document.getElementById("toggleSelectionButton").setAttribute("aria-pressed", String(selectionMode));
  document.getElementById("toggleSelectionButton").textContent = selectionMode ? "選択モードを終了" : "選択モード";
  document.getElementById("selectionCount").textContent = `${selectedTaskIds.size}件選択`;
  document.getElementById("selectionModeHint").textContent = selectionMode
    ? `選択中：${selectedTaskIds.size}件。青い選択欄にチェックして、画面下から操作します。`
    : "選択モードでまとめて操作できます";
  for (const id of ["bulkCompleteButton", "bulkMigrateButton", "bulkDeleteButton"]) {
    document.getElementById(id).disabled = selectedTaskIds.size === 0;
  }
}
document.getElementById("toggleSelectionButton").addEventListener("click", () => {
  selectionMode = !selectionMode;
  selectedTaskIds.clear();
  displayAllTasks();
});
document.getElementById("exitSelectionButton").addEventListener("click", () => {
  selectionMode = false;
  selectedTaskIds.clear();
  displayAllTasks();
});
document.getElementById("selectPageButton").addEventListener("click", () => {
  pageTaskIds.forEach(id => selectedTaskIds.add(id));
  displayAllTasks();
});
document.getElementById("clearSelectionButton").addEventListener("click", () => {
  selectedTaskIds.clear(); displayAllTasks();
});
document.getElementById("listCategorySelect").addEventListener("change", event => {
  selectedCategory = event.target.value;
  displayTasks();
});
for (const [id, direction] of [["previousPage", -1], ["nextPage", 1], ["previousPageTop", -1], ["nextPageTop", 1]]) {
  document.getElementById(id).addEventListener("click", () => {
    listPage = Math.max(0, listPage + direction);
    selectedTaskIds.clear();
    displayAllTasks();
    allTasksCount.scrollIntoView({ block: "start" });
  });
}
function runBulkAction(action) {
  const chosen = tasks.filter(task => selectedTaskIds.has(task.id) && pageTaskIds.includes(task.id) && !task.completed);
  if (!chosen.length) return;
  const today = formatDate(new Date());
  const tomorrow = formatDate(addDays(new Date(), 1));
  const chosenIds = new Set(chosen.map(task => task.id));
  const eligible = chosen.filter(task => {
    if (action === "complete") return !tasks.some(child => child.parentId === task.id && !child.completed && !chosenIds.has(child.id));
    if (action === "migrate") return (!task.deadline || task.deadline > today) && task.plannedDate !== tomorrow;
    return true;
  });
  const skipped = chosen.length - eligible.length;
  const names = { complete: "完了", migrate: "明日へ移行", delete: "削除" };
  if (!names[action]) return;
  if (!eligible.length) {
    document.getElementById("bulkResult").textContent = "処理できるタスクがありません。未完了の子がある親、今日以前が締切の移行、既に明日へ移行済みのものは対象外です。";
    return;
  }
  if (!confirm(`選択した${chosen.length}件のうち${eligible.length}件を${names[action]}します。${skipped}件は条件により処理しません。${action === "delete" ? "親を削除しても未選択の子は独立したタスクとして残します。削除は取り消せません。" : "子タスクは自動で対象に含めません。"}\n対象：${eligible.slice(0, 5).map(task => task.title).join("、")}${eligible.length > 5 ? " ほか" : ""}`)) return;
  const changedIds = new Set(eligible.map(task => task.id));
  if (action === "delete") {
    tasks = tasks.filter(task => !changedIds.has(task.id));
    tasks.forEach(task => { if (changedIds.has(task.parentId)) task.parentId = null; });
  } else for (const task of eligible) {
    if (action === "complete") {
      task.progressBeforeCompletion = task.progress ?? 0;
      task.completed = true;
      task.progress = 100;
      task.completedAt = new Date().toISOString();
    } else {
      task.migrationUndo = { plannedDate: task.plannedDate ?? null, migrationCount: task.migrationCount ?? 0, targetDate: tomorrow };
      task.plannedDate = tomorrow;
      task.migrationCount = (task.migrationCount ?? 0) + 1;
    }
  }
  if (!saveTasks()) {
    document.getElementById("bulkResult").textContent = "保存できなかったため変更は反映していません。";
    return;
  }
  selectedTaskIds.clear();
  displayTasks();
  if (action === "complete") showCompletionUndo(eligible);
  document.getElementById("bulkResult").textContent = `${eligible.length}件を${names[action]}しました。${skipped}件は対象外です。${action === "complete" ? "画面の「元に戻す」でまとめて取り消せます。" : ""}`;
}
for (const [id, action] of [["bulkCompleteButton", "complete"], ["bulkMigrateButton", "migrate"], ["bulkDeleteButton", "delete"]]) {
  document.getElementById(id).addEventListener("click", () => runBulkAction(action));
}
document.getElementById("openAddButton").addEventListener("click", () => openAddTaskModal());
document.getElementById("cancelAddButton").addEventListener("click", () => addTaskModal.close());
document.getElementById("menuButton").addEventListener("click", () => {
  taskMenu.showModal();
});
document.getElementById("closeMenuButton").addEventListener("click", () => taskMenu.close());
for (const [buttonId, guideId] of [["menuHelpButton", "usageGuide"], ["menuPrivacyButton", "privacyGuide"]]) {
  document.getElementById(buttonId).addEventListener("click", () => {
    taskMenu.close();
    showScreen("backup");
    const guide = document.getElementById(guideId);
    guide.open = true;
    guide.querySelector("summary").focus();
    guide.scrollIntoView({ block: "start" });
  });
}
for (const button of document.querySelectorAll(".bottom-nav [data-screen]")) {
  button.addEventListener("click", () => showScreen(button.dataset.screen));
}

showScreen("home");
displayTasks();
loadTodayReview();
