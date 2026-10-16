import { loadTasks, saveTasks } from "./storage.js";

const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };
let tasks = loadTasks();

const byId = id => tasks.find(task => task.id === id);
const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
};
const escapeText = value => String(value ?? "");
const formatDue = task => {
  if (!task.dueDate) return "No due date";
  const date = new Date(`${task.dueDate}T00:00:00`);
  const dateLabel = Number.isNaN(date.getTime()) ? task.dueDate : date.toLocaleDateString(undefined,{month:"short",day:"numeric"});
  return `${dateLabel}${task.dueTime ? ` · ${task.dueTime}` : ""}`;
};
const isOverdue = task => !task.completed && Boolean(task.dueDate) && task.dueDate < todayISO();
const isToday = task => task.dueDate === todayISO();
const isUpcoming = task => !task.completed && Boolean(task.dueDate) && task.dueDate > todayISO();

function emitChange() {
  saveTasks(tasks);
  window.dispatchEvent(new CustomEvent("taskschange", { detail: { tasks: getTasks() } }));
}

export function getTasks() { return tasks.map(task => ({ ...task })); }
export function getTask(id) { const task = byId(id); return task ? { ...task } : null; }
export function getTodayISO() { return todayISO(); }
export function taskIsOverdue(task) { return isOverdue(task); }
export function taskIsToday(task) { return isToday(task); }
export function taskIsUpcoming(task) { return isUpcoming(task); }
export function formatTaskDue(task) { return formatDue(task); }

export function createTask(data) {
  const title = String(data.title || "").trim();
  if (!title) throw new Error("Please enter a task title.");
  if (title.length > 160) throw new Error("Task title must be 160 characters or fewer.");
  const priority = ["Low", "Medium", "High"].includes(data.priority) ? data.priority : "Medium";
  const category = ["Work", "Study", "Personal", "Health", "Other"].includes(data.category) ? data.category : "Other";
  const now = Date.now();
  const task = {
    id: globalThis.crypto?.randomUUID?.() || `task-${now}-${Math.random().toString(36).slice(2,9)}`,
    title,
    description: String(data.description || "").trim().slice(0, 1000),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(data.dueDate || "") ? data.dueDate : "",
    dueTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(data.dueTime || "") ? data.dueTime : "",
    priority, category, completed: false, createdAt: now, updatedAt: now
  };
  tasks.push(task); emitChange(); return { ...task };
}

export function updateTask(id, data) {
  const task = byId(id);
  if (!task) throw new Error("This task could not be found.");
  const title = String(data.title || "").trim();
  if (!title) throw new Error("Please enter a task title.");
  if (title.length > 160) throw new Error("Task title must be 160 characters or fewer.");
  task.title = title;
  task.description = String(data.description || "").trim().slice(0, 1000);
  task.dueDate = /^\d{4}-\d{2}-\d{2}$/.test(data.dueDate || "") ? data.dueDate : "";
  task.dueTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(data.dueTime || "") ? data.dueTime : "";
  task.priority = ["Low", "Medium", "High"].includes(data.priority) ? data.priority : "Medium";
  task.category = ["Work", "Study", "Personal", "Health", "Other"].includes(data.category) ? data.category : "Other";
  task.updatedAt = Date.now(); emitChange(); return { ...task };
}

export function toggleTask(id) {
  const task = byId(id); if (!task) return;
  task.completed = !task.completed; task.updatedAt = Date.now(); emitChange();
}
export function deleteTask(id) {
  const before = tasks.length; tasks = tasks.filter(task => task.id !== id);
  if (tasks.length !== before) emitChange();
}
export function clearCompleted() {
  const before = tasks.length; tasks = tasks.filter(task => !task.completed);
  if (tasks.length !== before) emitChange();
}

export function getStats() {
  const total = tasks.length, completed = tasks.filter(t => t.completed).length;
  const pending = total - completed;
  const overdue = tasks.filter(isOverdue).length;
  const today = tasks.filter(t => isToday(t) && !t.completed).length;
  return { total, completed, pending, overdue, today, rate: total ? Math.round(completed / total * 100) : 0 };
}

export function filterTasks({ filter = "all", category = "all", priority = "all", search = "", sort = "due" } = {}) {
  const query = search.trim().toLocaleLowerCase();
  const filtered = tasks.filter(task => {
    if (filter === "today" && !isToday(task)) return false;
    if (filter === "upcoming" && !isUpcoming(task)) return false;
    if (filter === "completed" && !task.completed) return false;
    if (filter === "overdue" && !isOverdue(task)) return false;
    if (category !== "all" && task.category !== category) return false;
    if (priority !== "all" && task.priority !== priority) return false;
    if (query && !`${task.title} ${task.description}`.toLocaleLowerCase().includes(query)) return false;
    return true;
  });
  filtered.sort((a,b) => {
    if (sort === "priority") return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.createdAt - b.createdAt;
    if (sort === "created") return b.createdAt - a.createdAt;
    const ad = a.dueDate || "9999-12-31", bd = b.dueDate || "9999-12-31";
    return ad.localeCompare(bd) || (a.dueTime || "99:99").localeCompare(b.dueTime || "99:99") || b.createdAt - a.createdAt;
  });
  return filtered.map(task => ({ ...task }));
}
