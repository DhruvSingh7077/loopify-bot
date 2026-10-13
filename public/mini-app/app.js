const telegramWebApp = window.Telegram?.WebApp;
telegramWebApp?.ready();
telegramWebApp?.expand();

function authHeaders() {
  const initData = telegramWebApp?.initData;
  return initData
    ? { "x-telegram-init-data": initData }
    : {};
}

const activityList = document.querySelector("#activity-list");
const briefingTitle = document.querySelector("#briefing-title");
const briefingSummary = document.querySelector("#briefing-summary");
const formMessage = document.querySelector("#form-message");
const contactList = document.querySelector("#contact-list");
const calendarStatus = document.querySelector("#calendar-status");
const calendarMessage = document.querySelector("#calendar-message");
const connectCalendarButton = document.querySelector("#connect-calendar-button");
const disconnectCalendarButton = document.querySelector("#disconnect-calendar-button");
const syncCalendarButton = document.querySelector("#sync-calendar-button");
const calendarEventList = document.querySelector("#calendar-event-list");
const noteList = document.querySelector("#note-list");
const noteMessage = document.querySelector("#note-message");
const reportSummary = document.querySelector("#report-summary");
const reportLists = document.querySelector("#report-lists");

async function loadCalendarStatus() {
  const response = await fetch("/calendar/status", { headers: authHeaders() });
  if (!response.ok) {
    calendarStatus.textContent = "Unavailable";
    calendarMessage.textContent = "Calendar connection is unavailable.";
    return;
  }
  const status = await response.json();
  calendarStatus.textContent = status.connected ? "Connected" : "Not connected";
  calendarMessage.textContent = status.connected
    ? "Your Google Calendar is connected."
    : status.configured
      ? "Connect your primary Google Calendar."
      : "Google Calendar needs server configuration before it can be connected.";
  connectCalendarButton.hidden = !status.configured || status.connected;
  disconnectCalendarButton.hidden = !status.connected;
  syncCalendarButton.hidden = !status.connected;
}

function renderCalendarEvents(events) {
  calendarEventList.innerHTML = events.length
    ? events.map((event) => `<article class="activity"><div class="activity-title">${escapeHtml(event.title)}</div><div class="activity-meta">${formatWhen(event.startsAt)}${event.htmlLink ? ` · <a href="${event.htmlLink}" target="_blank" rel="noreferrer">Open in Google Calendar</a>` : ""}</div></article>`).join("")
    : '<p class="muted">No upcoming calendar events found.</p>';
}

async function syncCalendar() {
  calendarMessage.textContent = "Syncing upcoming events...";
  const response = await fetch("/calendar/events", { headers: authHeaders() });
  if (!response.ok) {
    calendarMessage.textContent = "Could not sync Google Calendar.";
    return;
  }
  renderCalendarEvents(await response.json());
  calendarMessage.textContent = "Calendar synced just now.";
}

async function connectCalendar() {
  const response = await fetch("/calendar/connect", { headers: authHeaders() });
  if (!response.ok) {
    calendarMessage.textContent = "Could not start Google Calendar connection.";
    return;
  }
  const { url } = await response.json();
  window.location.href = url;
}

async function disconnectCalendar() {
  const response = await fetch("/calendar/connection", {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (response.ok) loadCalendarStatus();
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.id === "sync-calendar-button") void syncCalendar();
  if (target.id === "connect-calendar-button") void connectCalendar();
  if (target.id === "disconnect-calendar-button") void disconnectCalendar();
});

function headers() {
  return { "Content-Type": "application/json", ...authHeaders() };
}

function formatWhen(value) {
  return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "No time set";
}

function renderActivities(activities) {
  if (!activities.length) {
    activityList.innerHTML = '<p class="muted">No activities found.</p>';
    return;
  }
  activityList.innerHTML = activities.map((activity) => `
    <article class="activity">
      <div class="activity-title">${escapeHtml(activity.title)}</div>
      <div class="activity-meta">${activity.type} · ${activity.priority} · ${formatWhen(activity.scheduledFor)}</div>
      <div class="activity-actions">
        ${activity.scheduledFor && activity.status === "pending" ? `<button class="small-button" data-calendar="${activity.id}">Add to Calendar</button>` : ""}
        ${activity.status === "pending" ? `<button class="small-button" data-complete="${activity.id}">Complete</button>` : `<span class="activity-meta">${activity.status}</span>`}
        <button class="small-button" data-edit="${activity.id}">Edit</button>
        <button class="small-button danger-button" data-delete="${activity.id}">Delete</button>
      </div>
    </article>
  `).join("");
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

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

async function loadDashboard() {
  const [activitiesResponse, briefingResponse] = await Promise.all([
    fetch("/activities", { headers: authHeaders() }),
    fetch("/briefing", { headers: authHeaders() }),
  ]);
  if (!activitiesResponse.ok || !briefingResponse.ok) throw new Error("Could not load the dashboard.");
  const activities = await activitiesResponse.json();
  const briefing = await briefingResponse.json();
  renderActivities(activities);
  briefingTitle.textContent = briefing.nextActivity ? `Next: ${briefing.nextActivity.title}` : "You are all caught up";
  briefingSummary.textContent = `${briefing.overdue.length} overdue · ${briefing.today.length} today · ${briefing.upcoming.length} upcoming`;
  loadContacts();
  loadNotes();
  loadCalendarStatus();
}

async function loadContacts() {
  const response = await fetch("/contacts", { headers: authHeaders() });
  if (!response.ok) return;
  const contacts = await response.json();
  contactList.innerHTML = contacts.length
    ? contacts.map((contact) => `<article class="activity"><div class="activity-title">${escapeHtml(contact.name)}</div><div class="activity-meta">${escapeHtml(contact.company || contact.relationship)}</div></article>`).join("")
    : '<p class="muted">No contacts found.</p>';
}

function renderNotes(notes) {
  noteList.innerHTML = notes.length
    ? notes.map((note) => `
      <article class="activity">
        <div class="activity-title">${escapeHtml(note.title)}</div>
        <div class="activity-meta">${formatWhen(note.notedAt || note.createdAt)}</div>
        <div>${escapeHtml(note.content)}</div>
        <div class="activity-actions">
          <button class="small-button danger-button" data-delete-note="${note.id}">Delete</button>
        </div>
      </article>
    `).join("")
    : '<p class="muted">No notes found.</p>';
  noteList.querySelectorAll("[data-delete-note]").forEach((button) => {
    button.addEventListener("click", () => deleteNote(button.dataset.deleteNote));
  });
}

async function loadNotes() {
  const search = document.querySelector("#note-search").value.trim();
  const response = await fetch(`/notes${search ? `?search=${encodeURIComponent(search)}` : ""}`, { headers: authHeaders() });
  if (response.ok) renderNotes(await response.json());
}

function reportItems(items) {
  return items.length
    ? items.slice(0, 10).map((item) =>
      `<div class="activity"><div class="activity-title">${escapeHtml(item.title)}</div><div class="activity-meta">${item.type} · ${formatWhen(item.scheduledFor)}</div></div>`,
    ).join("")
    : '<p class="muted">None</p>';
}

function renderReports(report) {
  const summary = report.summary;
  reportSummary.innerHTML = [
    ["Total", summary.total],
    ["Pending", summary.pending],
    ["Completed", summary.completed],
    ["Completion", `${summary.completionRate}%`],
  ].map(([label, value]) => `<div class="report-stat"><strong>${value}</strong><span>${label}</span></div>`).join("");
  reportLists.innerHTML = [
    ["Today", report.today],
    ["Overdue", report.overdue],
    ["Upcoming meetings", report.upcomingMeetings],
    ["Follow-ups", report.followUps],
    ["Completed", report.completed],
  ].map(([title, items]) => `<div class="report-list"><h3>${title}</h3>${reportItems(items)}</div>`).join("");
}

async function loadReports() {
  const response = await fetch("/reports", { headers: authHeaders() });
  if (response.ok) renderReports(await response.json());
  else reportSummary.innerHTML = '<p class="muted">Reports are unavailable.</p>';
}

async function completeActivity(id) {
  const response = await fetch(`/activities/${id}/complete`, { method: "POST", headers: authHeaders() });
  if (response.ok) loadDashboard();
}

async function addToCalendar(id, button) {
  button.disabled = true;
  const response = await fetch("/calendar/events", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ activityId: id }),
  });
  if (response.ok) {
    button.textContent = "Added to Calendar";
    return;
  }
  button.disabled = false;
  calendarMessage.textContent = "Could not add the activity to Google Calendar.";
}

async function editActivity(id) {
  const response = await fetch(`/activities/${id}`, { headers: authHeaders() });
  if (!response.ok) {
    formMessage.textContent = "Could not load this activity.";
    return;
  }
  const activity = await response.json();
  const title = window.prompt("Activity title", activity.title);
  if (title === null) return;
  const scheduledFor = window.prompt(
    "Scheduled time (YYYY-MM-DDTHH:mm), or leave blank to remove it",
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
  if (!updateResponse.ok) {
    formMessage.textContent = "Could not update this activity.";
    return;
  }
  formMessage.textContent = "Activity updated.";
  loadDashboard();
}

async function deleteActivity(id) {
  if (!window.confirm("Delete this activity and its linked Google Calendar event?")) return;
  const response = await fetch(`/activities/${id}`, { method: "DELETE", headers: authHeaders() });
  if (response.ok) {
    formMessage.textContent = "Activity deleted.";
    loadDashboard();
  } else {
    formMessage.textContent = "Could not delete this activity.";
  }

  async function deleteNote(id) {
    if (!window.confirm("Delete this note?")) return;
    const response = await fetch(`/notes/${id}`, { method: "DELETE", headers: authHeaders() });
    if (response.ok) {
      noteMessage.textContent = "Note deleted.";
      loadNotes();
      loadReports();
    } else {
      noteMessage.textContent = "Could not delete this note.";
    }
  }
}

document.querySelector("#activity-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const scheduledFor = form.get("scheduledFor");
  const response = await fetch("/activities", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      title: form.get("title"),
      type: form.get("type"),
      priority: form.get("priority"),
      scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
    }),
  });
  if (!response.ok) {
    formMessage.textContent = "Could not save this activity.";
    return;
  }
  event.target.reset();
  formMessage.textContent = "Activity added.";
  loadDashboard();
});

document.querySelector("#refresh-button").addEventListener("click", loadDashboard);
document.querySelector("#show-all-button").addEventListener("click", loadDashboard);
document.querySelector("#refresh-contacts-button").addEventListener("click", loadContacts);
document.querySelector("#refresh-notes-button").addEventListener("click", loadNotes);
document.querySelector("#refresh-reports-button").addEventListener("click", loadReports);
document.querySelector("#note-search").addEventListener("input", loadNotes);
document.querySelector("#note-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const response = await fetch("/notes", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ title: form.get("title"), content: form.get("content") }),
  });
  if (!response.ok) {
    noteMessage.textContent = "Could not save this note.";
    return;
  }
  event.target.reset();
  noteMessage.textContent = "Note saved.";
  loadNotes();
});
document.querySelector("#contact-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const response = await fetch("/contacts", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: form.get("name"),
      company: form.get("company"),
      relationship: form.get("relationship"),
    }),
  });
  if (response.ok) {
    event.target.reset();
    loadContacts();
  }
});
loadDashboard().catch((error) => { briefingTitle.textContent = error.message; });
