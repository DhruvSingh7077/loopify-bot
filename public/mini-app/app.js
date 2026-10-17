const telegramWebApp = window.Telegram?.WebApp;
telegramWebApp?.ready();
telegramWebApp?.expand();

// Helper for Telegram native haptic feedback
function haptic(type = "light") {
  try {
    if (type === "success") telegramWebApp?.HapticFeedback?.notificationOccurred("success");
    else if (type === "error") telegramWebApp?.HapticFeedback?.notificationOccurred("error");
    else telegramWebApp?.HapticFeedback?.impactOccurred(type);
  } catch {
    // Ignore if not supported
  }
}

// Toast notification helper
function showToast(message, isError = false) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.style.borderColor = isError ? "#f43f5e" : "#10b981";
  toast.classList.add("show");
  haptic(isError ? "error" : "success");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function authHeaders() {
  const initData = telegramWebApp?.initData;
  return initData ? { "x-telegram-init-data": initData } : {};
}

function headers() {
  return { "Content-Type": "application/json", ...authHeaders() };
}

function escapeHtml(value) {
  if (!value) return "";
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function formatWhen(value) {
  if (!value) return "No time set";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

// Global cached state
let allActivities = [];
let currentFilter = "all";

// DOM Elements
const activityList = document.querySelector("#activity-list");
const activitiesCount = document.querySelector("#activities-count");
const briefingTitle = document.querySelector("#briefing-title");
const briefingSummary = document.querySelector("#briefing-summary");
const formMessage = document.querySelector("#form-message");
const contactList = document.querySelector("#contact-list");
const contactsCount = document.querySelector("#contacts-count");
const calendarStatus = document.querySelector("#calendar-status");
const calendarMessage = document.querySelector("#calendar-message");
const connectCalendarButton = document.querySelector("#connect-calendar-button");
const disconnectCalendarButton = document.querySelector("#disconnect-calendar-button");
const syncCalendarButton = document.querySelector("#sync-calendar-button");
const calendarEventList = document.querySelector("#calendar-event-list");
const noteList = document.querySelector("#note-list");
const notesCount = document.querySelector("#notes-count");
const noteMessage = document.querySelector("#note-message");
const reportSummary = document.querySelector("#report-summary");
const reportLists = document.querySelector("#report-lists");
const refreshButton = document.querySelector("#refresh-button");

// Set current date in hero
const currentDateDisplay = document.querySelector("#current-date-display");
if (currentDateDisplay) {
  currentDateDisplay.textContent = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date());
}

// ---------------- TAB NAVIGATION ----------------
const navItems = document.querySelectorAll(".nav-item");
const tabPanes = document.querySelectorAll(".tab-pane");

navItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetTab = btn.dataset.tab;
    navItems.forEach((b) => b.classList.remove("active"));
    tabPanes.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.querySelector(`#${targetTab}`)?.classList.add("active");
    haptic("light");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

// ---------------- CHIP SELECTORS ----------------
document.querySelectorAll(".chips-selector").forEach((container) => {
  const targetId = container.dataset.target;
  const hiddenInput = document.querySelector(`input[name="${targetId}"]`) || document.querySelector(`#${targetId}`);
  container.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      container.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      if (hiddenInput) {
        hiddenInput.value = chip.dataset.val;
      }
      haptic("light");
    });
  });
});

// ---------------- TOGGLE QUICK ADD ----------------
const toggleAddFormBtn = document.querySelector("#toggle-add-form");
const activityForm = document.querySelector("#activity-form");
if (toggleAddFormBtn && activityForm) {
  toggleAddFormBtn.addEventListener("click", () => {
    const isHidden = activityForm.style.display === "none";
    activityForm.style.display = isHidden ? "block" : "none";
    toggleAddFormBtn.textContent = isHidden ? "Hide" : "Show";
    haptic("light");
  });
}

// ---------------- FILTER ACTIVITIES ----------------
document.querySelectorAll(".filter-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    currentFilter = pill.dataset.filter || "all";
    haptic("light");
    renderFilteredActivities();
  });
});

function renderFilteredActivities() {
  let filtered = allActivities;
  if (currentFilter === "pending") {
    filtered = allActivities.filter((a) => a.status === "pending");
  } else if (currentFilter === "completed") {
    filtered = allActivities.filter((a) => a.status === "completed");
  }
  renderActivities(filtered);
}

// ---------------- CALENDAR ----------------
async function loadCalendarStatus() {
  try {
    const response = await fetch("/calendar/status", { headers: authHeaders() });
    if (!response.ok) {
      calendarStatus.textContent = "Unavailable";
      calendarStatus.className = "status-pill disconnected";
      calendarMessage.textContent = "Calendar connection is unavailable.";
      return;
    }
    const status = await response.json();
    calendarStatus.textContent = status.connected ? "Connected" : "Not connected";
    calendarStatus.className = `status-pill ${status.connected ? "connected" : "disconnected"}`;
    calendarMessage.textContent = status.connected
      ? "Google Calendar synced & active."
      : status.configured
        ? "Connect your calendar to sync events automatically."
        : "Google Calendar credentials required on server.";
    connectCalendarButton.hidden = !status.configured || status.connected;
    disconnectCalendarButton.hidden = !status.connected;
    syncCalendarButton.hidden = !status.connected;
  } catch (error) {
    console.error("Could not load calendar status:", error);
  }
}

function renderCalendarEvents(events) {
  calendarEventList.innerHTML = events.length
    ? events.map((event) => `
        <article class="activity-item">
          <div class="activity-item-header">
            <div class="activity-item-title">${escapeHtml(event.title)}</div>
          </div>
          <div class="activity-badges">
            <span class="mini-badge time">🗓️ ${formatWhen(event.startsAt)}</span>
            ${event.htmlLink ? `<a href="${event.htmlLink}" target="_blank" rel="noreferrer" class="mini-badge type" style="text-decoration:none;">Open in Google</a>` : ""}
          </div>
        </article>
      `).join("")
    : '<div class="empty-state">No upcoming calendar events found.</div>';
}

async function syncCalendar() {
  calendarMessage.textContent = "Syncing upcoming events...";
  haptic("light");
  try {
    const response = await fetch("/calendar/events", { headers: authHeaders() });
    if (!response.ok) {
      calendarMessage.textContent = "Could not sync Google Calendar.";
      showToast("Calendar sync failed", true);
      return;
    }
    renderCalendarEvents(await response.json());
    calendarMessage.textContent = "Calendar synced successfully.";
    showToast("Calendar synced! 📅");
  } catch {
    showToast("Error syncing calendar", true);
  }
}

async function connectCalendar() {
  haptic("light");
  try {
    const response = await fetch("/calendar/connect", { headers: authHeaders() });
    if (!response.ok) {
      calendarMessage.textContent = "Could not start Google Calendar connection.";
      showToast("Connection failed", true);
      return;
    }
    const { url } = await response.json();
    window.location.href = url;
  } catch {
    showToast("Could not connect to Google", true);
  }
}

async function disconnectCalendar() {
  if (!window.confirm("Disconnect Google Calendar?")) return;
  haptic("light");
  const response = await fetch("/calendar/connection", {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (response.ok) {
    showToast("Calendar disconnected");
    loadCalendarStatus();
  }
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.id === "sync-calendar-button") void syncCalendar();
  if (target.id === "connect-calendar-button") void connectCalendar();
  if (target.id === "disconnect-calendar-button") void disconnectCalendar();
});

// ---------------- ACTIVITIES ----------------
function renderActivities(activities) {
  if (activitiesCount) activitiesCount.textContent = activities.length;
  if (!activities.length) {
    activityList.innerHTML = '<div class="empty-state">No activities found.</div>';
    return;
  }

  const typeIcons = {
    task: "✓",
    meeting: "👥",
    call: "📞",
    "follow-up": "🔄",
  };

  activityList.innerHTML = activities.map((activity) => {
    const isCompleted = activity.status === "completed";
    const priority = activity.priority || "medium";
    const icon = typeIcons[activity.type] || "•";

    return `
      <article class="activity-item priority-${priority} ${isCompleted ? "completed" : ""}">
        <div class="activity-item-header">
          <div class="activity-item-title">${escapeHtml(activity.title)}</div>
        </div>
        <div class="activity-badges">
          <span class="mini-badge type">${icon} ${activity.type || "task"}</span>
          <span class="mini-badge type">${priority}</span>
          ${activity.scheduledFor ? `<span class="mini-badge time">⏰ ${formatWhen(activity.scheduledFor)}</span>` : ""}
          ${isCompleted ? '<span class="mini-badge status-done">Completed</span>' : ""}
        </div>
        <div class="activity-item-actions">
          ${!isCompleted ? `<button class="action-btn complete" data-complete="${activity.id}">✓ Complete</button>` : ""}
          ${activity.scheduledFor && !isCompleted ? `<button class="action-btn" data-calendar="${activity.id}">+ Calendar</button>` : ""}
          <button class="action-btn" data-edit="${activity.id}">Edit</button>
          <button class="action-btn danger" data-delete="${activity.id}">Delete</button>
        </div>
      </article>
    `;
  }).join("");

  activityList.querySelectorAll("[data-complete]").forEach((button) => {
    button.addEventListener("click", () => completeActivity(button.dataset.complete));
  });
  activityList.querySelectorAll("[data-calendar]").forEach((button) => {
    button.addEventListener("click", () => addToCalendar(button.dataset.calendar, button));
  });
  activityList.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => editActivity(button.dataset.edit));
  });
  activityList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteActivity(button.dataset.delete));
  });
}

async function completeActivity(id) {
  haptic("success");
  const response = await fetch(`/activities/${id}/complete`, { method: "POST", headers: authHeaders() });
  if (response.ok) {
    showToast("Activity marked completed! 🎉");
    loadDashboard();
  }
}

async function addToCalendar(id, button) {
  button.disabled = true;
  haptic("light");
  const response = await fetch("/calendar/events", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ activityId: id }),
  });
  if (response.ok) {
    button.textContent = "Added to Calendar";
    showToast("Added to Google Calendar! 📅");
    return;
  }
  button.disabled = false;
  showToast("Could not add to Calendar", true);
}

async function editActivity(id) {
  haptic("light");
  const response = await fetch(`/activities/${id}`, { headers: authHeaders() });
  if (!response.ok) {
    showToast("Could not load activity", true);
    return;
  }
  const activity = await response.json();
  const title = window.prompt("Activity title:", activity.title);
  if (title === null) return;
  const scheduledFor = window.prompt(
    "Scheduled time (YYYY-MM-DDTHH:mm), or leave blank:",
    activity.scheduledFor ? new Date(activity.scheduledFor).toISOString().slice(0, 16) : "",
  );
  if (scheduledFor === null) return;
  const update = { title: title.trim() };
  if (scheduledFor.trim()) update.scheduledFor = new Date(scheduledFor).toISOString();
  else update.scheduledFor = undefined;

  const updateResponse = await fetch(`/activities/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(update),
  });
  if (updateResponse.ok) {
    showToast("Activity updated! ✨");
    loadDashboard();
  } else {
    showToast("Update failed", true);
  }
}

async function deleteActivity(id) {
  if (!window.confirm("Delete this activity?")) return;
  haptic("light");
  const response = await fetch(`/activities/${id}`, { method: "DELETE", headers: authHeaders() });
  if (response.ok) {
    showToast("Activity deleted");
    loadDashboard();
  } else {
    showToast("Could not delete activity", true);
  }
}

// ---------------- DASHBOARD & BRIEFING ----------------
async function loadDashboard() {
  refreshButton?.classList.add("spinning");
  try {
    const [activitiesResponse, briefingResponse] = await Promise.all([
      fetch("/activities", { headers: authHeaders() }),
      fetch("/briefing", { headers: authHeaders() }),
    ]);
    if (!activitiesResponse.ok || !briefingResponse.ok) throw new Error("Could not load dashboard.");

    allActivities = await activitiesResponse.json();
    const briefing = await briefingResponse.json();

    renderFilteredActivities();

    briefingTitle.textContent = briefing.nextActivity
      ? `Next: ${briefing.nextActivity.title}`
      : "You are all caught up";

    briefingSummary.innerHTML = `
      <span class="hero-stat-pill ${briefing.overdue.length ? "overdue" : ""}">
        ● ${briefing.overdue.length} overdue
      </span>
      <span class="hero-stat-pill">
        ● ${briefing.today.length} today
      </span>
      <span class="hero-stat-pill">
        ● ${briefing.upcoming.length} upcoming
      </span>
    `;

    loadContacts();
    loadNotes();
    loadCalendarStatus();
    loadReports();
  } catch (error) {
    console.error(error);
    briefingTitle.textContent = "Offline or Server Error";
    showToast("Could not refresh dashboard", true);
  } finally {
    setTimeout(() => refreshButton?.classList.remove("spinning"), 500);
  }
}

// ---------------- CONTACTS ----------------
const AVATAR_COLORS = [
  "linear-gradient(135deg, #059669, #10b981)",
  "linear-gradient(135deg, #0284c7, #38bdf8)",
  "linear-gradient(135deg, #0d9488, #14b8a6)",
  "linear-gradient(135deg, #d97706, #f59e0b)",
  "linear-gradient(135deg, #e11d48, #fb7185)",
];

function getAvatarColor(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name = "") {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

async function loadContacts() {
  try {
    const response = await fetch("/contacts", { headers: authHeaders() });
    if (!response.ok) return;
    const contacts = await response.json();
    if (contactsCount) contactsCount.textContent = contacts.length;
    contactList.innerHTML = contacts.length
      ? contacts.map((contact) => `
          <article class="contact-card-item">
            <div class="avatar-circle" style="background: ${getAvatarColor(contact.name)}">
              ${escapeHtml(getInitials(contact.name))}
            </div>
            <div class="contact-info">
              <div class="contact-name">${escapeHtml(contact.name)}</div>
              <div class="contact-meta">
                ${contact.company ? `<span>🏢 ${escapeHtml(contact.company)}</span> · ` : ""}
                <span class="mini-badge type">${escapeHtml(contact.relationship || "contact")}</span>
              </div>
            </div>
          </article>
        `).join("")
      : '<div class="empty-state">No contacts added yet.</div>';
  } catch (error) {
    console.error("Could not load contacts:", error);
  }
}

// ---------------- NOTES ----------------
async function deleteNote(id) {
  if (!window.confirm("Delete this note?")) return;
  haptic("light");
  const response = await fetch(`/notes/${id}`, { method: "DELETE", headers: authHeaders() });
  if (response.ok) {
    showToast("Note deleted");
    loadNotes();
    loadReports();
  } else {
    showToast("Could not delete note", true);
  }
}

function renderNotes(notes) {
  if (notesCount) notesCount.textContent = notes.length;
  noteList.innerHTML = notes.length
    ? notes.map((note) => `
        <article class="note-card-item">
          <div class="note-card-header">
            <div class="note-title">${escapeHtml(note.title)}</div>
            <div class="note-date">${formatWhen(note.notedAt || note.createdAt)}</div>
          </div>
          <div class="note-body">${escapeHtml(note.content)}</div>
          <div class="activity-item-actions">
            <button class="action-btn danger" data-delete-note="${note.id}">Delete</button>
          </div>
        </article>
      `).join("")
    : '<div class="empty-state">No notes found.</div>';

  noteList.querySelectorAll("[data-delete-note]").forEach((button) => {
    button.addEventListener("click", () => deleteNote(button.dataset.deleteNote));
  });
}

async function loadNotes() {
  try {
    const search = document.querySelector("#note-search")?.value.trim() || "";
    const response = await fetch(`/notes${search ? `?search=${encodeURIComponent(search)}` : ""}`, { headers: authHeaders() });
    if (response.ok) renderNotes(await response.json());
  } catch (error) {
    console.error("Could not load notes:", error);
  }
}

// ---------------- REPORTS ----------------
function reportItems(items) {
  return items.length
    ? items.slice(0, 8).map((item) => `
        <div class="activity-item priority-${item.priority || "medium"}" style="margin-top:6px;">
          <div class="activity-item-title">${escapeHtml(item.title)}</div>
          <div class="activity-badges" style="margin-bottom:0;">
            <span class="mini-badge type">${item.type || "task"}</span>
            <span class="mini-badge time">⏰ ${formatWhen(item.scheduledFor)}</span>
          </div>
        </div>
      `).join("")
    : '<div class="empty-state" style="padding:10px 0;">None</div>';
}

function renderReports(report) {
  const summary = report.summary;
  reportSummary.innerHTML = `
    <div class="stat-kpi-card">
      <div class="stat-kpi-val" style="color: #60a5fa;">${summary.total}</div>
      <div class="stat-kpi-label">Total Activities</div>
    </div>
    <div class="stat-kpi-card">
      <div class="stat-kpi-val" style="color: #fbbf24;">${summary.pending}</div>
      <div class="stat-kpi-label">Pending Action</div>
    </div>
    <div class="stat-kpi-card">
      <div class="stat-kpi-val" style="color: #34d399;">${summary.completed}</div>
      <div class="stat-kpi-label">Completed</div>
    </div>
    <div class="stat-kpi-card">
      <div class="stat-kpi-val" style="color: #a78bfa;">${summary.completionRate}%</div>
      <div class="stat-kpi-label">Completion Rate</div>
      <div class="stat-kpi-progress">
        <div class="stat-kpi-bar" style="width: ${summary.completionRate}%;"></div>
      </div>
    </div>
  `;

  reportLists.innerHTML = [
    ["Today", report.today],
    ["Overdue", report.overdue],
    ["Upcoming Meetings", report.upcomingMeetings],
    ["Follow-ups", report.followUps],
    ["Completed", report.completed],
  ].map(([title, items]) => `
    <div class="report-category-group" style="margin-bottom: 14px;">
      <h4>${title} (${items.length})</h4>
      ${reportItems(items)}
    </div>
  `).join("");
}

async function loadReports() {
  try {
    const response = await fetch("/reports", { headers: authHeaders() });
    if (response.ok) renderReports(await response.json());
    else reportSummary.innerHTML = '<div class="empty-state">Reports unavailable.</div>';
  } catch {
    reportSummary.innerHTML = '<div class="empty-state">Error loading reports.</div>';
  }
}

// ---------------- FORM SUBMISSIONS ----------------
document.querySelector("#activity-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  haptic("light");
  const form = new FormData(event.target);
  const scheduledFor = form.get("scheduledFor");
  const title = form.get("title");

  const response = await fetch("/activities", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      title,
      type: form.get("type") || "task",
      priority: form.get("priority") || "medium",
      scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
    }),
  });

  if (!response.ok) {
    showToast("Could not create activity", true);
    return;
  }

  event.target.reset();
  showToast("Activity added! ✨");
  loadDashboard();
});

document.querySelector("#contact-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  haptic("light");
  const form = new FormData(event.target);
  const response = await fetch("/contacts", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: form.get("name"),
      company: form.get("company"),
      relationship: form.get("relationship") || "customer",
    }),
  });

  if (response.ok) {
    event.target.reset();
    showToast("Contact added! 👤");
    loadContacts();
  } else {
    showToast("Could not add contact", true);
  }
});

document.querySelector("#note-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  haptic("light");
  const form = new FormData(event.target);
  const response = await fetch("/notes", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ title: form.get("title"), content: form.get("content") }),
  });

  if (!response.ok) {
    showToast("Could not save note", true);
    return;
  }

  event.target.reset();
  showToast("Note saved! 📝");
  loadNotes();
});

// Event listeners for searches and refreshes
refreshButton?.addEventListener("click", () => {
  haptic("light");
  loadDashboard();
});
document.querySelector("#show-all-button")?.addEventListener("click", loadDashboard);
document.querySelector("#refresh-contacts-button")?.addEventListener("click", () => {
  haptic("light");
  loadContacts();
});
document.querySelector("#refresh-notes-button")?.addEventListener("click", () => {
  haptic("light");
  loadNotes();
});
document.querySelector("#refresh-reports-button")?.addEventListener("click", () => {
  haptic("light");
  loadReports();
});
document.querySelector("#note-search")?.addEventListener("input", loadNotes);

// Initial Dashboard Load
loadDashboard().catch((error) => {
  briefingTitle.textContent = error.message;
});
