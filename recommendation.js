// 保存データを変更しない、推薦・締切判定の共通ルール。
(function (root) {
  "use strict";
  function effectiveDeadline(task, tasks) {
    return task.deadline || tasks.find(parent => parent.id === task.parentId)?.deadline || "";
  }
  function withDeadline(task, tasks) {
    return { ...task, deadline: effectiveDeadline(task, tasks) };
  }
  function state(task, tasks) {
    if (task.completed) return "completed";
    if (tasks.some(child => child.parentId === task.id && !child.completed)) return "blocked";
    if (Number(task.progress ?? 0) >= 100) return "confirmation";
    return "work";
  }
  function format(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function add(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
  function bucket(task, tasks, now) {
    const deadline = effectiveDeadline(task, tasks);
    if (!deadline) return "none";
    const today = format(now);
    if (deadline < today) return "overdue";
    if (deadline === today) return "today";
    if (deadline === format(add(now, 1))) return "tomorrow";
    return deadline <= format(add(now, (7 - now.getDay()) % 7)) ? "week" : "later";
  }
  function categorize(tasks, visibleTasks, now, calculateStart, sort) {
    const today = format(now);
    const tomorrow = format(add(now, 1));
    const end = format(add(now, (7 - now.getDay()) % 7));
    const result = { today: [], tomorrow: [], week: [], suggestions: [], confirmations: [] };
    const unscheduled = [];
    for (const task of visibleTasks) {
      const status = state(task, tasks);
      if (status === "completed" || status === "blocked") continue;
      if (status === "confirmation") { result.confirmations.push(task); continue; }
      const deadline = effectiveDeadline(task, tasks);
      // 締切当日と期限切れは、未来の手動予定日より優先する。
      if (deadline && deadline <= today) { result.today.push(task); continue; }
      if (!deadline && !task.plannedDate) { unscheduled.push(task); continue; }
      const start = task.plannedDate || calculateStart(task);
      if (start === null || start <= today) result.today.push(task);
      else if (start === tomorrow) result.tomorrow.push(task);
      else if (start > tomorrow && start <= end) result.week.push(task);
    }
    result.suggestions = sort(unscheduled).slice(0, Math.max(0, 3 - result.today.length));
    return result;
  }
  const api = { effectiveDeadline, withDeadline, state, bucket, categorize };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TaskFlowRecommendation = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
