const STORAGE_KEY = "futari-board.tasks.v1";
const STATUS_ORDER = ["backlog", "progress", "done"];
const STATUS_LABELS = {
  backlog: "これから",
  progress: "進行中",
  done: "完了",
};
const OWNER_LABELS = {
  "dev-a": "開発者 A",
  "dev-b": "開発者 B",
};

const elements = {
  board: document.querySelector("#board"),
  dialog: document.querySelector("#taskDialog"),
  form: document.querySelector("#taskForm"),
  id: document.querySelector("#taskId"),
  title: document.querySelector("#taskTitle"),
  description: document.querySelector("#taskDescription"),
  owner: document.querySelector("#taskOwner"),
  status: document.querySelector("#taskStatus"),
  dialogTitle: document.querySelector("#dialogTitle"),
  search: document.querySelector("#searchInput"),
  ownerFilter: document.querySelector("#ownerFilter"),
  liveMessage: document.querySelector("#liveMessage"),
};

let tasks = readTasks();

function readTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) return [];

    return stored.filter((task) => (
      task && typeof task.id === "string" &&
      typeof task.title === "string" &&
      STATUS_ORDER.includes(task.status)
    )).map((task) => ({
      id: task.id,
      title: task.title.slice(0, 90),
      description: typeof task.description === "string" ? task.description.slice(0, 240) : "",
      owner: task.owner === "dev-a" || task.owner === "dev-b" ? task.owner : "",
      status: task.status,
    }));
  } catch {
    return [];
  }
}

function persistTasks(nextTasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTasks));
    tasks = nextTasks;
    return true;
  } catch {
    announce("保存できませんでした。このブラウザーの保存領域を確認してください。");
    return false;
  }
}

function announce(message) {
  elements.liveMessage.textContent = message;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createButton(label, action, taskId, className = "task-action") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.action = action;
  button.dataset.taskId = taskId;
  button.textContent = label;
  return button;
}

function createTaskCard(task) {
  const card = document.createElement("article");
  card.className = "task-card";

  const top = document.createElement("div");
  top.className = "task-card-top";
  const title = document.createElement("h4");
  title.textContent = task.title;
  const owner = document.createElement("span");
  owner.className = `owner-badge ${task.owner === "dev-b" ? "owner-b" : task.owner ? "" : "owner-none"}`;
  owner.textContent = OWNER_LABELS[task.owner] || "未割当";
  top.append(title, owner);
  card.append(top);

  if (task.description) {
    const description = document.createElement("p");
    description.className = "task-description";
    description.textContent = task.description;
    card.append(description);
  }

  const actions = document.createElement("div");
  actions.className = "task-actions";
  const position = STATUS_ORDER.indexOf(task.status);
  if (position > 0) {
    actions.append(createButton("← 戻す", "move", task.id));
  }
  if (position < STATUS_ORDER.length - 1) {
    actions.append(createButton("次へ →", "move", task.id));
  }
  actions.append(createButton("編集", "edit", task.id));
  actions.append(createButton("削除", "delete", task.id, "task-action action-delete"));
  card.append(actions);
  return card;
}

function matchesFilters(task) {
  const query = elements.search.value.trim().toLocaleLowerCase("ja");
  const ownerFilter = elements.ownerFilter.value;
  const text = `${task.title} ${task.description}`.toLocaleLowerCase("ja");
  return (!query || text.includes(query)) && (ownerFilter === "all" || task.owner === ownerFilter);
}

function render() {
  const visibleTasks = tasks.filter(matchesFilters);

  for (const status of STATUS_ORDER) {
    const list = document.querySelector(`#${status}Tasks`);
    const statusTasks = visibleTasks.filter((task) => task.status === status);
    document.querySelector(`#${status}Count`).textContent = String(statusTasks.length);
    list.replaceChildren();

    if (statusTasks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const message = document.createElement("p");
      message.textContent = visibleTasks.length === 0 && tasks.length > 0
        ? "条件に合うタスクはありません。"
        : status === "backlog"
          ? "まずは小さなタスクをひとつ追加してみましょう。"
          : `${STATUS_LABELS[status]}のタスクはここに表示されます。`;
      empty.append(message);
      if (tasks.length === 0 && status === "backlog") {
        const add = document.createElement("button");
        add.type = "button";
        add.className = "empty-add";
        add.dataset.action = "add";
        add.dataset.status = status;
        add.textContent = "+ タスクを追加";
        empty.append(add);
      }
      list.append(empty);
    } else {
      list.append(...statusTasks.map(createTaskCard));
    }
  }

  document.querySelector("#totalCount").textContent = String(tasks.length);
  document.querySelector("#activeCount").textContent = String(tasks.filter((task) => task.status === "progress").length);
  document.querySelector("#doneCount").textContent = String(tasks.filter((task) => task.status === "done").length);
}

function openTaskDialog(task = null, status = "backlog") {
  elements.form.reset();
  elements.id.value = task?.id || "";
  elements.title.value = task?.title || "";
  elements.description.value = task?.description || "";
  elements.owner.value = task?.owner || "";
  elements.status.value = task?.status || status;
  elements.dialogTitle.textContent = task ? "タスクを編集" : "タスクを追加";
  elements.dialog.showModal();
  elements.title.focus();
}

function handleBoardAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, taskId, status } = button.dataset;
  if (action === "add") {
    openTaskDialog(null, status);
    return;
  }

  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;

  if (action === "edit") {
    openTaskDialog(task);
  } else if (action === "delete") {
    if (!window.confirm(`「${task.title}」を削除しますか？`)) return;
    const nextTasks = tasks.filter((item) => item.id !== task.id);
    if (persistTasks(nextTasks)) {
      render();
      announce("タスクを削除しました。");
    }
  } else if (action === "move") {
    const nextPosition = STATUS_ORDER.indexOf(task.status) + (button.textContent.startsWith("次へ") ? 1 : -1);
    const nextStatus = STATUS_ORDER[nextPosition];
    const nextTasks = tasks.map((item) => item.id === task.id ? { ...item, status: nextStatus } : item);
    if (persistTasks(nextTasks)) {
      render();
      announce(`${STATUS_LABELS[nextStatus]}に移動しました。`);
    }
  }
}

elements.board.addEventListener("click", handleBoardAction);
document.querySelector("#openTaskDialog").addEventListener("click", () => openTaskDialog());
document.querySelector("#closeTaskDialog").addEventListener("click", () => elements.dialog.close());
document.querySelector("#cancelTaskDialog").addEventListener("click", () => elements.dialog.close());
elements.search.addEventListener("input", render);
elements.ownerFilter.addEventListener("change", render);

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = elements.title.value.trim();
  if (!title) {
    elements.title.focus();
    return;
  }

  const editingId = elements.id.value;
  const task = {
    id: editingId || makeId(),
    title,
    description: elements.description.value.trim(),
    owner: elements.owner.value,
    status: elements.status.value,
  };

  const nextTasks = editingId
    ? tasks.map((item) => item.id === editingId ? task : item)
    : [task, ...tasks];

  if (persistTasks(nextTasks)) {
    elements.dialog.close();
    render();
    announce(editingId ? "タスクを更新しました。" : "タスクを追加しました。");
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    tasks = readTasks();
    render();
    announce("別のタブでの変更を反映しました。");
  }
});

render();

