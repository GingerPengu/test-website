// journal.js
// Uses Tauri v2's fs plugin to store each entry as its own JSON file,
// inside a subfolder, under the app's data directory:
//
//   <AppData>/entries/<folder>/<entry-id>.json
//
// This is what makes "save to folders" real: folders are just
// directories, entries are just files in them.

import {
  BaseDirectory,
  readDir,
  mkdir,
  readTextFile,
  writeTextFile,
  remove,
  exists,
} from "@tauri-apps/plugin-fs";

const ENTRIES_ROOT = "entries";
const DEFAULT_FOLDER = "General";

// ---- DOM refs ----
const folderListEl = document.getElementById("folderList");
const newFolderForm = document.getElementById("newFolderForm");
const newFolderNameInput = document.getElementById("newFolderName");
const currentFolderLabel = document.getElementById("currentFolderLabel");
const entryTitleInput = document.getElementById("entryTitle");
const entryTextInput = document.getElementById("entryText");
const saveBtn = document.getElementById("saveBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const statusMsg = document.getElementById("statusMsg");
const entryListEl = document.getElementById("entryList");
const emptyMsg = document.getElementById("emptyMsg");

// ---- State ----
let currentFolder = DEFAULT_FOLDER;
let editingId = null; // null = creating a new entry, otherwise the id being edited

// ---- Path helpers ----
function folderPath(folder) {
  return `${ENTRIES_ROOT}/${folder}`;
}

function entryPath(folder, id) {
  return `${ENTRIES_ROOT}/${folder}/${id}.json`;
}

async function ensureRootExists() {
  const rootExists = await exists(ENTRIES_ROOT, { baseDir: BaseDirectory.AppData });
  if (!rootExists) {
    await mkdir(ENTRIES_ROOT, { baseDir: BaseDirectory.AppData, recursive: true });
  }
  const defaultExists = await exists(folderPath(DEFAULT_FOLDER), { baseDir: BaseDirectory.AppData });
  if (!defaultExists) {
    await mkdir(folderPath(DEFAULT_FOLDER), { baseDir: BaseDirectory.AppData, recursive: true });
  }
}

// ---- Folder operations ----
async function listFolders() {
  const items = await readDir(ENTRIES_ROOT, { baseDir: BaseDirectory.AppData });
  return items
    .filter((item) => item.isDirectory)
    .map((item) => item.name)
    .sort((a, b) => a.localeCompare(b));
}

async function createFolder(name) {
  const clean = name.trim();
  if (!clean) return;
  await mkdir(folderPath(clean), { baseDir: BaseDirectory.AppData, recursive: true });
  await renderFolders();
  await switchFolder(clean);
}

async function renderFolders() {
  const folders = await listFolders();
  folderListEl.innerHTML = "";
  for (const folder of folders) {
    const li = document.createElement("li");
    li.textContent = folder;
    if (folder === currentFolder) li.classList.add("active");
    li.addEventListener("click", () => switchFolder(folder));
    folderListEl.appendChild(li);
  }
}

async function switchFolder(folder) {
  currentFolder = folder;
  currentFolderLabel.textContent = folder;
  resetEditor();
  await renderFolders();
  await renderEntries();
}

// ---- Entry operations ----
async function listEntries() {
  const items = await readDir(folderPath(currentFolder), { baseDir: BaseDirectory.AppData });
  const entries = [];
  for (const item of items) {
    if (item.isFile && item.name.endsWith(".json")) {
      const id = item.name.replace(/\.json$/, "");
      try {
        const raw = await readTextFile(entryPath(currentFolder, id), { baseDir: BaseDirectory.AppData });
        entries.push(JSON.parse(raw));
      } catch (err) {
        console.error(`Failed to read entry ${id}:`, err);
      }
    }
  }
  // Newest first
  entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return entries;
}

async function saveEntry() {
  const title = entryTitleInput.value.trim();
  const content = entryTextInput.value;

  if (!content.trim()) {
    setStatus("Write something before saving.", true);
    return;
  }

  const now = new Date().toISOString();
  const id = editingId ?? crypto.randomUUID();

  let createdAt = now;
  if (editingId) {
    // Preserve the original createdAt when updating
    try {
      const raw = await readTextFile(entryPath(currentFolder, id), { baseDir: BaseDirectory.AppData });
      createdAt = JSON.parse(raw).createdAt ?? now;
    } catch {
      // fall back to `now` if the original can't be read
    }
  }

  const entry = { id, title, content, folder: currentFolder, createdAt, updatedAt: now };
  await writeTextFile(entryPath(currentFolder, id), JSON.stringify(entry, null, 2), {
    baseDir: BaseDirectory.AppData,
  });

  setStatus(editingId ? "Entry updated." : "Entry saved.");
  resetEditor();
  await renderEntries();
}

async function deleteEntry(id) {
  const confirmed = window.confirm("Delete this entry? This can't be undone.");
  if (!confirmed) return;

  await remove(entryPath(currentFolder, id), { baseDir: BaseDirectory.AppData });
  if (editingId === id) resetEditor();
  setStatus("Entry deleted.");
  await renderEntries();
}

function loadEntryIntoEditor(entry) {
  editingId = entry.id;
  entryTitleInput.value = entry.title ?? "";
  entryTextInput.value = entry.content ?? "";
  saveBtn.textContent = "Update Entry";
  cancelEditBtn.hidden = false;
  entryTextInput.focus();
}

function resetEditor() {
  editingId = null;
  entryTitleInput.value = "";
  entryTextInput.value = "";
  saveBtn.textContent = "Save Entry";
  cancelEditBtn.hidden = true;
}

function setStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.style.color = isError ? "var(--danger)" : "var(--accent)";
  setTimeout(() => {
    if (statusMsg.textContent === msg) statusMsg.textContent = "";
  }, 2500);
}

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function renderEntries() {
  const entries = await listEntries();
  entryListEl.innerHTML = "";
  emptyMsg.hidden = entries.length > 0;

  for (const entry of entries) {
    const li = document.createElement("li");
    li.className = "entry-card";

    const top = document.createElement("div");
    top.className = "entry-card-top";

    const title = document.createElement("h3");
    title.textContent = entry.title || "(untitled)";

    const date = document.createElement("span");
    date.className = "entry-date";
    date.textContent = formatDate(entry.updatedAt);

    top.appendChild(title);
    top.appendChild(date);

    const snippet = document.createElement("p");
    snippet.className = "entry-snippet";
    const text = entry.content || "";
    snippet.textContent = text.length > 160 ? text.slice(0, 160) + "…" : text;

    const actions = document.createElement("div");
    actions.className = "entry-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => loadEntryIntoEditor(entry));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteEntry(entry.id));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(top);
    li.appendChild(snippet);
    li.appendChild(actions);
    entryListEl.appendChild(li);
  }
}

// ---- Wire up events ----
saveBtn.addEventListener("click", saveEntry);
cancelEditBtn.addEventListener("click", resetEditor);

newFolderForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = newFolderNameInput.value;
  newFolderNameInput.value = "";
  await createFolder(name);
});

// ---- Init ----
(async function init() {
  try {
    await ensureRootExists();
    currentFolderLabel.textContent = currentFolder;
    await renderFolders();
    await renderEntries();
  } catch (err) {
    console.error(err);
    setStatus("Couldn't load entries — check the console.", true);
  }
})();