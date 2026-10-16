const STORAGE_KEYS = {
  tasks: "daylight.tasks.v1",
  settings: "daylight.settings.v1"
};

export function loadTasks() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEYS.tasks) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(task => task && typeof task.id === "string" && typeof task.title === "string")
      .map(task => ({
        id: task.id,
        title: task.title.slice(0, 160),
        description: typeof task.description === "string" ? task.description.slice(0, 1000) : "",
        dueDate: typeof task.dueDate === "string" ? task.dueDate : "",
        dueTime: typeof task.dueTime === "string" ? task.dueTime : "",
        priority: ["Low", "Medium", "High"].includes(task.priority) ? task.priority : "Medium",
        category: ["Work", "Study", "Personal", "Health", "Other"].includes(task.category) ? task.category : "Other",
        completed: Boolean(task.completed),
        createdAt: Number.isFinite(task.createdAt) ? task.createdAt : Date.now(),
        updatedAt: Number.isFinite(task.updatedAt) ? task.updatedAt : Date.now()
      }));
  } catch (error) {
    console.warn("Could not read saved tasks. Starting with an empty list.", error);
    return [];
  }
}

export function saveTasks(tasks) {
  try {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
    return true;
  } catch (error) {
    console.error("Could not save tasks.", error);
    return false;
  }
}

const DEFAULT_SETTINGS = { city: "", latitude: null, longitude: null, country: "", unit: "celsius", theme: "light" };

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || "{}");
    return {
      ...DEFAULT_SETTINGS,
      ...(saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {}),
      unit: saved?.unit === "fahrenheit" ? "fahrenheit" : "celsius",
      theme: saved?.theme === "dark" ? "dark" : "light",
      city: typeof saved?.city === "string" ? saved.city : "",
      country: typeof saved?.country === "string" ? saved.country : "",
      latitude: Number.isFinite(saved?.latitude) ? saved.latitude : null,
      longitude: Number.isFinite(saved?.longitude) ? saved.longitude : null
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error("Could not save settings.", error);
    return false;
  }
}
