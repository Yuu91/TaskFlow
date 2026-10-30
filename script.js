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
    deadline: noDeadlineInput.checked ? "" : deadlineInput.value,
    priority: priorityInput.value,
    size: sizeInput.value,
    progress: 0,
    completed: false,
    completedAt: null,
  };

  tasks.push(newTask);
  if (!saveTasks()) return;

  taskInput.value = "";
  deadlineInput.value = "";
  plannedDateInput.value = "";
  categoryInput.value = "";
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

  if (!task) return;

  task.completed = true;
  task.progress = 100;
  task.completedAt = new Date().toISOString();

  saveTasks();
  displayTasks();
}

function deleteTask(id) {
  const result = confirm("このタスクを削除しますか？");

  if (!result) return;

  tasks = tasks.filter((task) => task.id !== id);

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

  // 現在の設定をフォームに反映
  editTaskInput.value = task.title;
  editDeadlineInput.value = task.deadline || "";
  editPlannedDateInput.value = task.plannedDate || "";
  editCategoryInput.value = task.category || "";
  editNoDeadlineInput.checked = !task.deadline;
  syncDeadlineInput(editNoDeadlineInput, editDeadlineInput);
  editPriorityInput.value = task.priority || "medium";
  editSizeInput.value = task.size || "normal";

  // 編集画面を開く
  modalReturnFocus = document.activeElement;
  editModal.hidden = false;
  document.querySelector("main").inert = true;
  document.querySelector(".backup-controls").inert = true;
  document.querySelector(".app-guides").inert = true;
  document.querySelector(".category-controls").inert = true;
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

function createTaskCard(task) {
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
  taskInfo.appendChild(details);
  if (task.category) {
    const category = document.createElement("small");
    category.textContent = `分類：${task.category}`;
    taskInfo.appendChild(category);
  }

  // ===== 移行回数の表示 =====

  if ((task.migrationCount ?? 0) > 0) {
    const migrationText = document.createElement("small");

    migrationText.className = "migration-text";
    migrationText.textContent = `↪ ${task.migrationCount}回移行済み`;

    taskInfo.appendChild(migrationText);
  }

  // ===== 優先スコア表示 =====

  const priorityScore = calculatePriorityScore(task);

  const scoreBadge = document.createElement("span");
  scoreBadge.className = "priority-score";

  if (priorityScore >= 75) {
    scoreBadge.textContent = `最優先・${priorityScore}点`;
    scoreBadge.classList.add("priority-urgent");
  } else if (priorityScore >= 50) {
    scoreBadge.textContent = `優先・${priorityScore}点`;
    scoreBadge.classList.add("priority-high");
  } else {
    scoreBadge.textContent = `通常・${priorityScore}点`;
    scoreBadge.classList.add("priority-normal");
  }

  taskInfo.appendChild(scoreBadge);

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

  taskInfo.appendChild(scheduleText);
  if (task.plannedDate) {
    const planned = document.createElement("small");
    planned.textContent = `手動予定日：${task.plannedDate}（締切超過時は今日を優先）`;
    taskInfo.appendChild(planned);
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
  if (canUndoMigration(task)) buttonGroup.appendChild(createUndoMigrationButton(task));

  li.appendChild(taskInfo);
  li.appendChild(progressContainer);
  li.appendChild(buttonGroup);

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
      task.completed = false;
      task.completedAt = null;
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
  todayTasks.forEach(function (task) {
    todayTaskList.appendChild(createDailyTaskItem(task));
  });
  categorized.suggestions.forEach(task => {
    todayTaskList.appendChild(createDailyTaskItem(task, true));
  });
  if (categorized.suggestions.length > 0) {
    todayCount.textContent = `${todayTasks.length}件＋おすすめ${categorized.suggestions.length}件`;
  }

  // 明日のタスク
  tomorrowTasks.forEach(function (task) {
    tomorrowTaskList.appendChild(createDailyTaskItem(task));
  });

  // 今週のタスク
  weekTasks.forEach(function (task) {
    weekTaskList.appendChild(createDailyTaskItem(task));
  });

  todayEmptyMessage.hidden = todayTasks.length + categorized.suggestions.length !== 0;
}

/* ===== 今日のプラン用の小さなカード ===== */

/* ===== 今日のプラン用カード ===== */

/* ===== 指定したタスクカードへ移動 ===== */

function jumpToTaskCard(id) {
  // 全タスク画面へ切り替える
  showScreen("all");

  // 検索や絞り込みを解除する
  taskSearch.value = "";
  taskFilter.value = "all";
  // 表示中の分類は維持する。

  // タスク一覧を再描画
  displayAllTasks();

  // 該当するタスクカードを探す
  const cards = allTasksList.querySelectorAll("[data-task-id]");

  const target = Array.from(cards).find((card) => card.dataset.taskId === id);

  if (!target) {
    return;
  }

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

function createDailyTaskItem(task, isSuggestion = false) {
  const li = document.createElement("li");
  li.className = "daily-task-item";

  // タスクカードをクリックすると詳細へ移動
  li.classList.add("daily-task-clickable");
  li.tabIndex = 0;
  li.setAttribute("role", "button");

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
  score.textContent = `${calculatePriorityScore(task)}点`;

  // 操作エリア
  const actions = document.createElement("div");
  actions.className = "daily-task-actions";

  actions.appendChild(score);
  if (canUndoMigration(task)) actions.appendChild(createUndoMigrationButton(task));

  // 今日のタスクにだけ移行ボタンを表示
  const todayText = formatDate(new Date());

  const plannedDate = task.plannedDate || calculateStartDate(task);

  const isTodayTask = plannedDate === null || plannedDate <= todayText;

  // 締切が今日以前なら明日へ移行できない
  const canMigrate = !task.deadline || task.deadline > todayText;

  if (isTodayTask && canMigrate) {
    const migrateButton = document.createElement("button");

    migrateButton.textContent = "明日へ移行";
    migrateButton.className = "migrate-button";

    migrateButton.addEventListener("click", function () {
      migrateTaskToTomorrow(task.id);
    });

    actions.appendChild(migrateButton);
  }

  li.appendChild(info);
  li.appendChild(actions);

  return li;
}

/* ===== ホーム画面のタスク ===== */

function displayHomeTasks() {
  taskList.innerHTML = "";

  const activeTasks = getVisibleTasks().filter((task) => !task.completed);
  const sortedTasks = sortByDeadline(activeTasks);

  taskCount.textContent = `（全${activeTasks.length}件）`;

  sortedTasks.slice(0, MAX_VISIBLE_TASKS).forEach(function (task) {
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

  let filteredTasks = activeTasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(keyword);

    let matchesFilter = true;

    if (filterType === "hasDeadline") {
      matchesFilter = Boolean(task.deadline);
    }

    if (filterType === "noDeadline") {
      matchesFilter = !task.deadline;
    }

    return matchesSearch && matchesFilter;
  });

  filteredTasks = sortTasks(filteredTasks, sortType);

  allTasksCount.textContent = `${filteredTasks.length}件表示中 / 全${activeTasks.length}件`;

  filteredTasks.forEach(function (task) {
    allTasksList.appendChild(createTaskCard(task));
  });

  emptyTaskMessage.hidden = filteredTasks.length !== 0;
}

/* ===== 全体の表示更新 ===== */

function displayTasks() {
  refreshCategoryOptions();
  displayHomeTasks();
  displayAllTasks();
  displayCompletedTasks();
  displayDailyPlan();
  displayDailyReview();
}

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
  const hadFocus = tabs.contains(document.activeElement);
  tabs.innerHTML = "";
  for (const [value, label] of [["", "すべて"], ["__uncategorized", "未分類"], ...categories.map(name => [`category:${name}`, name])]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = "category-tab";
    button.setAttribute("aria-pressed", String(value === selectedCategory));
    button.addEventListener("click", () => {
      selectedCategory = value;
      displayTasks();
    });
    tabs.appendChild(button);
    if (hadFocus && value === selectedCategory) button.focus();
  }
  const options = document.getElementById("categoryOptions");
  options.innerHTML = "";
  for (const name of new Set(["大学", "仕事", "私生活", "生活", ...categories])) {
    const option = document.createElement("option");
    option.value = name;
    options.appendChild(option);
  }
  document.getElementById("categoryStatus").textContent = selectedCategory
    ? `「${selectedCategory === "__uncategorized" ? "未分類" : selectedCategory.slice(9)}」のタスクを表示中。振り返りメモとバックアップは全分類共通です。`
    : "すべての分類を表示中";
}

/* ===== 画面切り替え ===== */

function showScreen(screen) {
  currentScreen = screen;

  homeScreen.hidden = screen !== "home";
  allTasksScreen.hidden = screen !== "all";

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
  document.querySelector("main").inert = false;
  document.querySelector(".backup-controls").inert = false;
  document.querySelector(".app-guides").inert = false;
  document.querySelector(".category-controls").inert = false;
  document.body.classList.remove("modal-open");
  if (modalReturnFocus?.isConnected) modalReturnFocus.focus();
  else (currentScreen === "all" ? backButton : taskInput).focus();
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
  document.getElementById("shareBackupButton").hidden = !canShare;
  document.getElementById("backupSaveStatus").textContent = "まだファイルには保存していません。下の保存方法を選んでください。";
});
document.getElementById("closeBackupButton").addEventListener("click", () => {
  document.getElementById("backupPreview").hidden = true;
  document.getElementById("exportButton").setAttribute("aria-expanded", "false");
  preparedBackup = null;
  document.getElementById("exportButton").focus();
});
document.getElementById("downloadBackupButton").addEventListener("click", () => {
  if (!preparedBackup) return;
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
  if (!preparedBackup) return;
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
const importFile = document.getElementById("importFile");
document.getElementById("importButton").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  importFile.value = "";
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("ファイルは5MB以下にしてください。");
    const data = JSON.parse(await file.text());
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
  } catch (error) {
    notifyStorage(`復元できませんでした。現在のデータは変更していません。${error.message}`);
  }
});

showScreen("home");
displayTasks();
loadTodayReview();
