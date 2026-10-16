import { loadSettings, saveSettings } from "./storage.js";
import { createTask, updateTask, toggleTask, deleteTask, clearCompleted, getTasks, getTask, getStats, filterTasks, getTodayISO, taskIsOverdue, taskIsToday, taskIsUpcoming, formatTaskDue } from "./tasks.js";
import { searchCity, fetchWeather, renderWeather } from "./weather.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let settings = loadSettings();
let currentFilter = "all";
let currentDetailId = null;
let weatherBusy = false;

function showMessage(message, type = "info") {
  const element = $("#app-message");
  element.textContent = message;
  element.className = `message ${type === "error" ? "error" : type === "success" ? "success" : ""}`;
  element.hidden = false;
  clearTimeout(showMessage.timeout);
  showMessage.timeout = setTimeout(() => { element.hidden = true; }, 6500);
}
function updateGreeting() {
  const now = new Date();
  const hour = now.getHours();
  $("#greeting-title").textContent = hour < 12 ? "Good morning." : hour < 17 ? "Good afternoon." : "Good evening.";
  $("#today-label").textContent = now.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}).toUpperCase();
  $("#planner-date").textContent = now.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  $("#planner-date-pill").textContent = now.toLocaleDateString(undefined,{month:"short",day:"numeric"});
}
function setTheme(theme) {
  settings.theme = theme === "dark" ? "dark" : "light";
  document.body.classList.toggle("dark", settings.theme === "dark");
  $("#theme-icon").textContent = settings.theme === "dark" ? "☀" : "☾";
  $("#theme-label").textContent = settings.theme === "dark" ? "Light mode" : "Dark mode";
  saveSettings(settings);
}
function setUnit(unit) {
  settings.unit = unit === "fahrenheit" ? "fahrenheit" : "celsius";
  $$(".unit-button").forEach(button => button.classList.toggle("active", button.dataset.unit === settings.unit));
  saveSettings(settings);
  if (settings.latitude !== null && settings.longitude !== null) refreshWeather(false);
}
function setView(view) {
  const allowed = ["dashboard","tasks","planner"];
  if (!allowed.includes(view)) return;
  $$(".view-section").forEach(section => section.classList.toggle("active-view", section.id === `view-${view}`));
  $$(".nav-link[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  if (view === "tasks") renderAllTasks();
  if (view === "planner") renderPlanner();
  window.scrollTo({top:0,behavior:"smooth"});
}
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function createTaskElement(task, showActions = true) {
  const overdue = taskIsOverdue(task);
  const item = node("article", `task-item${task.completed ? " completed" : ""}${overdue ? " overdue" : ""}`);
  const checkbox = node("input","task-check");
  checkbox.type = "checkbox"; checkbox.checked = task.completed; checkbox.setAttribute("aria-label",`${task.completed ? "Reopen" : "Complete"} task: ${task.title}`);
  checkbox.addEventListener("change", () => toggleTask(task.id));
  const main = node("div","task-main");
  main.tabIndex = 0; main.setAttribute("role","button"); main.setAttribute("aria-label",`View task: ${task.title}`);
  main.append(node("div","task-title",task.title));
  if (task.description) main.append(node("div","task-description-preview",task.description));
  const meta = node("div","task-meta");
  meta.append(node("span",`priority ${task.priority}`,task.priority),node("span","category-tag",task.category),node("span","task-tag",formatTaskDue(task)));
  if (overdue) meta.append(node("span","priority High","Overdue"));
  main.append(meta);
  const openDetails = () => openDetail(task.id);
  main.addEventListener("click",openDetails);
  main.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openDetails();}});
  item.append(checkbox,main);
  if (showActions) {
    const actions = node("div","task-actions");
    const edit = node("button","small-action","✎"); edit.type="button"; edit.title="Edit task"; edit.setAttribute("aria-label",`Edit ${task.title}`); edit.addEventListener("click",()=>openTaskDialog(task));
    const remove = node("button","small-action delete","×"); remove.type="button"; remove.title="Delete task"; remove.setAttribute("aria-label",`Delete ${task.title}`); remove.addEventListener("click",()=>{if(confirm(`Delete “${task.title}”? This cannot be undone.`))deleteTask(task.id);});
    actions.append(edit,remove); item.append(actions);
  }
  const due = node("div","task-due",task.dueTime || "");
  if (task.dueTime) item.append(due);
  return item;
}
function setEmpty(container, message) { container.replaceChildren(node("div","empty-state",message)); }
function renderDashboard() {
  const tasks = getTasks(), stats = getStats();
  $("#nav-pending").textContent = stats.pending;
  $("#stat-completed").textContent = stats.completed;
  $("#stat-pending").textContent = stats.pending;
  $("#completion-rate").textContent = `${stats.rate}%`;
  $("#progress-ring").style.background = `conic-gradient(#596ee9 ${stats.rate}%, var(--line) ${stats.rate}% 100%)`;
  $("#progress-message").textContent = !stats.total ? "A fresh start. Add your first task." : stats.rate === 100 ? "Everything is complete. Great work!" : stats.rate >= 70 ? "You're making excellent progress. Keep going." : stats.rate >= 35 ? "You're building momentum. One task at a time." : "Every small step counts. Keep moving forward.";
  const today = tasks.filter(task=>taskIsToday(task)&&!task.completed).sort((a,b)=>(a.dueTime||"99:99").localeCompare(b.dueTime||"99:99"));
  const todayList = $("#today-task-list"); todayList.replaceChildren();
  if (!today.length) setEmpty(todayList,"No pending tasks due today. Add one above or create a task with today's date.");
  else today.slice(0,5).forEach(task=>todayList.append(createTaskElement(task)));
  const upcoming = tasks.filter(task=>taskIsUpcoming(task)).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,4);
  const upcomingList = $("#upcoming-list"); upcomingList.replaceChildren();
  if (!upcoming.length) setEmpty(upcomingList,"No upcoming tasks yet. Add a due date to plan ahead.");
  else upcoming.forEach(task=>{
    const date = new Date(`${task.dueDate}T12:00:00`);
    const wrap = node("div","upcoming-item");
    const dateCard = node("div","upcoming-date"); dateCard.append(node("strong","",String(date.getDate()).padStart(2,"0")),node("small","",date.toLocaleDateString(undefined,{month:"short"})));
    const text = node("div","upcoming-text"); text.append(node("strong","",task.title),node("small","",`${task.category} · ${task.priority} priority${task.dueTime ? ` · ${task.dueTime}` : ""}`));
    wrap.append(dateCard,text); upcomingList.append(wrap);
  });
  const warning = $("#planner-weather-warning");
  $("#weather-tip").textContent = warning && !warning.hidden ? "Rain or wind may affect outdoor plans. Consider a flexible backup." : "Check the forecast and make time for a short outdoor break.";
}
function renderAllTasks() {
  const category = $("#category-filter").value, priority = $("#priority-filter").value, search = $("#task-search").value, sort = $("#sort-tasks").value;
  const tasks = filterTasks({filter:currentFilter,category,priority,search,sort});
  const container = $("#all-task-list"); container.replaceChildren();
  if (!tasks.length) setEmpty(container,"No tasks match this view yet. Add a task or adjust your filters.");
  else tasks.forEach(task=>container.append(createTaskElement(task)));
  $("#task-result-count").textContent = `${tasks.length} ${tasks.length===1?"task":"tasks"}`;
  const stats = getStats();
  $("#list-summary").textContent = `${stats.completed} completed · ${stats.pending} remaining · ${stats.overdue} overdue`;
}
function renderPlanner() {
  const tasks = getTasks().filter(task=>taskIsToday(task)).sort((a,b)=>(a.dueTime||"99:99").localeCompare(b.dueTime||"99:99"));
  const completed = tasks.filter(task=>task.completed).length;
  $("#planner-total").textContent = tasks.length;
  $("#planner-done").textContent = completed;
  $("#planner-left").textContent = tasks.length-completed;
  $("#planner-progress").style.width = `${tasks.length ? Math.round(completed/tasks.length*100) : 0}%`;
  const list = $("#planner-task-list"); list.replaceChildren();
  if (!tasks.length) setEmpty(list,"Your day is open. Add a task to start shaping your plan.");
  else tasks.forEach(task=>list.append(createTaskElement(task)));
}
function renderAll() { renderDashboard(); renderAllTasks(); renderPlanner(); }
function openTaskDialog(task = null, prefillTitle = "") {
  $("#task-form").reset();
  $("#task-id").value = task?.id || "";
  $("#task-title").value = task?.title || prefillTitle;
  $("#task-description").value = task?.description || "";
  $("#task-date").value = task?.dueDate || getTodayISO();
  $("#task-time").value = task?.dueTime || "";
  $("#task-priority").value = task?.priority || "Medium";
  $("#task-category").value = task?.category || "Personal";
  $("#task-dialog-title").textContent = task ? "Edit task" : "Create a task";
  $("#save-task").textContent = task ? "Save changes" : "Save task";
  $("#task-form-error").hidden = true;
  $("#task-dialog").showModal();
  $("#task-title").focus();
}
function closeTaskDialog() { $("#task-dialog").close(); }
function openDetail(id) {
  const task = getTask(id); if (!task) return;
  currentDetailId = id;
  $("#detail-title").textContent = task.title;
  $("#detail-description").textContent = task.description || "No description added.";
  const meta = $("#detail-meta"); meta.replaceChildren();
  [task.category,`${task.priority} priority`,formatTaskDue(task),task.completed?"Completed":"Pending",taskIsOverdue(task)?"Overdue":""].filter(Boolean).forEach(value=>meta.append(node("span","",value)));
  $("#detail-done").textContent = task.completed ? "Mark incomplete" : "Mark complete";
  $("#detail-dialog").showModal();
}
function closeDetail() { $("#detail-dialog").close(); currentDetailId = null; }
async function loadLocationWeather(place, {persistCity=true}={}) {
  if (weatherBusy) return;
  weatherBusy = true; $("#refresh-weather").disabled = true; $("#refresh-weather").textContent = "…";
  try {
    const data = await fetchWeather(place.latitude, place.longitude);
    const renderedPlace = renderWeather(data,place,settings.unit);
    settings.latitude = place.latitude; settings.longitude = place.longitude;
    settings.country = place.country || "";
    if (persistCity) settings.city = place.name || "";
    saveSettings(settings);
    showMessage(`Weather updated for ${[renderedPlace.city,renderedPlace.country].filter(Boolean).join(", ")}.`, "success");
    renderDashboard();
  } catch (error) {
    showMessage(error.message || "Unable to load weather. Check your connection and try again.", "error");
  } finally {
    weatherBusy = false; $("#refresh-weather").disabled = false; $("#refresh-weather").textContent = "↻";
  }
}
async function refreshWeather(showSuccess=true) {
  if (settings.latitude === null || settings.longitude === null) {
    if (settings.city) return searchAndLoadCity(settings.city,showSuccess);
    showMessage("Search for a city or allow location access to load weather.", "info"); return;
  }
  if (showSuccess) await loadLocationWeather({name:settings.city||"Selected location",country:settings.country,latitude:settings.latitude,longitude:settings.longitude});
  else {
    try {
      const data = await fetchWeather(settings.latitude,settings.longitude);
      renderWeather(data,{name:settings.city||"Selected location",country:settings.country,latitude:settings.latitude,longitude:settings.longitude},settings.unit);
      renderDashboard();
    } catch(error) { showMessage(error.message || "Unable to refresh weather.", "error"); }
  }
}
async function searchAndLoadCity(query, showSuccess=true) {
  try {
    const place = await searchCity(query);
    await loadLocationWeather(place);
  } catch (error) { showMessage(error.message || "City search failed. Try again.", "error"); }
}
function requestLocation() {
  if (!navigator.geolocation) { showMessage("Location is not supported by this browser. Search for a city instead.","error"); return; }
  showMessage("Requesting your location permission…");
  navigator.geolocation.getCurrentPosition(async position => {
    const {latitude,longitude} = position.coords;
    // Reverse geocoding is intentionally avoided; coordinates are used directly.
    await loadLocationWeather({name:"Your location",country:"",latitude,longitude},{persistCity:false});
    settings.city = "Your location"; saveSettings(settings);
  }, error => {
    const reason = error.code === 1 ? "Location permission was denied." : error.code === 2 ? "Your location could not be determined." : "Location request timed out.";
    showMessage(`${reason} You can search for a city instead.`,"error");
  }, {enableHighAccuracy:false,timeout:10000,maximumAge:300000});
}

function bindEvents() {
  $$("[data-view]").forEach(button=>button.addEventListener("click",()=>setView(button.dataset.view)));
  $("#theme-toggle").addEventListener("click",()=>setTheme(settings.theme==="dark"?"light":"dark"));
  $$(".unit-button").forEach(button=>button.addEventListener("click",()=>setUnit(button.dataset.unit)));
  $("#city-form").addEventListener("submit",event=>{event.preventDefault();const value=$("#city-input").value.trim();if(value)searchAndLoadCity(value);});
  $("#location-button").addEventListener("click",requestLocation);
  $("#refresh-weather").addEventListener("click",()=>refreshWeather(true));
  $("#quick-task-form").addEventListener("submit",event=>{
    event.preventDefault();const title=$("#quick-task-title").value;
    try { createTask({title,dueDate:getTodayISO(),category:"Personal",priority:"Medium"});$("#quick-task-title").value="";showMessage("Task added to today's list.","success"); }
    catch(error){showMessage(error.message,"error");}
  });
  $("#open-task-modal").addEventListener("click",()=>openTaskDialog());
  $("#planner-add-task").addEventListener("click",()=>openTaskDialog(null,""));
  $("#task-form").addEventListener("submit",event=>{
    event.preventDefault();
    const data={title:$("#task-title").value,description:$("#task-description").value,dueDate:$("#task-date").value,dueTime:$("#task-time").value,priority:$("#task-priority").value,category:$("#task-category").value};
    try {
      const id=$("#task-id").value;
      if(id)updateTask(id,data);else createTask(data);
      closeTaskDialog();showMessage(id?"Task updated.":"Task created.","success");
    } catch(error) {$("#task-form-error").textContent=error.message;$("#task-form-error").hidden=false;}
  });
  ["close-task-modal","cancel-task"].forEach(id=>$("#"+id).addEventListener("click",closeTaskDialog));
  $("#task-dialog").addEventListener("click",event=>{if(event.target===$("#task-dialog"))closeTaskDialog();});
  $("#close-detail").addEventListener("click",closeDetail);
  $("#detail-dialog").addEventListener("click",event=>{if(event.target===$("#detail-dialog"))closeDetail();});
  $("#detail-edit").addEventListener("click",()=>{const task=getTask(currentDetailId);closeDetail();if(task)openTaskDialog(task);});
  $("#detail-done").addEventListener("click",()=>{if(currentDetailId)toggleTask(currentDetailId);closeDetail();});
  $("#task-filters").addEventListener("click",event=>{
    const button=event.target.closest("[data-filter]");if(!button)return;
    currentFilter=button.dataset.filter;
    $$("#task-filters .filter-tab").forEach(item=>item.classList.toggle("active",item===button));
    renderAllTasks();
  });
  ["category-filter","priority-filter","sort-tasks"].forEach(id=>$("#"+id).addEventListener("change",renderAllTasks));
  $("#task-search").addEventListener("input",renderAllTasks);
  $("#clear-completed").addEventListener("click",()=>{
    const count=getTasks().filter(task=>task.completed).length;
    if(!count){showMessage("There are no completed tasks to clear.");return;}
    if(confirm(`Permanently delete ${count} completed ${count===1?"task":"tasks"}?`)){clearCompleted();showMessage("Completed tasks cleared.","success");}
  });
  window.addEventListener("taskschange",renderAll);
  window.addEventListener("online",()=>showMessage("Connection restored. You can refresh the weather.","success"));
  window.addEventListener("offline",()=>showMessage("You are offline. Saved tasks still work, but weather needs an internet connection.","error"));
}
async function initializeWeather() {
  if(settings.latitude!==null&&settings.longitude!==null){
    try {
      const data=await fetchWeather(settings.latitude,settings.longitude);
      renderWeather(data,{name:settings.city||"Selected location",country:settings.country,latitude:settings.latitude,longitude:settings.longitude},settings.unit);
      renderDashboard();
      return;
    } catch(error) { showMessage("Saved weather location could not be refreshed. Try searching for a city.","error"); }
  }
  if(settings.city){await searchAndLoadCity(settings.city);return;}
  // Useful default city; no weather values are hard-coded or fabricated.
  await searchAndLoadCity("Freetown");
}

updateGreeting();setTheme(settings.theme);$$(".unit-button").forEach(button=>button.classList.toggle("active",button.dataset.unit===settings.unit));bindEvents();renderAll();initializeWeather();
