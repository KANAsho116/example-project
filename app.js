const STORAGE_KEY = "futari-board.tasks.v1";
const ACTIVE_BOARD_KEY = "futari-board.active-board.v1";
const STATUS_ORDER = ["backlog", "progress", "done"];
const STATUS_LABELS = {
  backlog: "これから",
  progress: "進行中",
  done: "完了",
};
const PRIORITY_ORDER = ["high", "medium", "low"];
const PRIORITY_LABELS = {
  high: "高",
  medium: "中",
  low: "低",
};
const OWNER_LABELS = {
  "dev-a": "開発者 A",
  "dev-b": "開発者 B",
};
const supabaseClient = window.FUTARI_SUPABASE_CONFIG && window.supabase?.createClient
  ? window.supabase.createClient(
    window.FUTARI_SUPABASE_CONFIG.url,
    window.FUTARI_SUPABASE_CONFIG.publishableKey,
  )
  : null;

const elements = {
  board: document.querySelector("#board"),
  dialog: document.querySelector("#taskDialog"),
  form: document.querySelector("#taskForm"),
  id: document.querySelector("#taskId"),
  title: document.querySelector("#taskTitle"),
  description: document.querySelector("#taskDescription"),
  owner: document.querySelector("#taskOwner"),
  status: document.querySelector("#taskStatus"),
  priority: document.querySelector("#taskPriority"),
  dueDate: document.querySelector("#taskDueDate"),
  labels: document.querySelector("#taskLabels"),
  dialogTitle: document.querySelector("#dialogTitle"),
  search: document.querySelector("#searchInput"),
  ownerFilter: document.querySelector("#ownerFilter"),
  labelFilter: document.querySelector("#labelFilter"),
  liveMessage: document.querySelector("#liveMessage"),
  undoBar: document.querySelector("#undoBar"),
  undoMessage: document.querySelector("#undoMessage"),
  undoDelete: document.querySelector("#undoDelete"),
  cloudStatus: document.querySelector("#cloudStatus"),
  cloudMessage: document.querySelector("#cloudMessage"),
  authForm: document.querySelector("#authForm"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  cloudWorkspace: document.querySelector("#cloudWorkspace"),
  signedInUser: document.querySelector("#signedInUser"),
  signOut: document.querySelector("#signOut"),
  cloudBoardSelect: document.querySelector("#cloudBoardSelect"),
  newBoardName: document.querySelector("#newBoardName"),
  createBoard: document.querySelector("#createBoard"),
  joinCode: document.querySelector("#joinCode"),
  joinBoard: document.querySelector("#joinBoard"),
  invitePanel: document.querySelector("#invitePanel"),
  inviteCode: document.querySelector("#inviteCode"),
  copyInvite: document.querySelector("#copyInvite"),
  rotateInvite: document.querySelector("#rotateInvite"),
  importLocalTasks: document.querySelector("#importLocalTasks"),
  exportButton: document.querySelector("#exportTasks"),
  importButton: document.querySelector("#importTasks"),
  importFile: document.querySelector("#importFile"),
};

let tasks = readTasks();
let pendingUndo = null;
let undoTimer = null;
let currentUser = null;
let currentBoardId = null;
let realtimeChannel = null;

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
      priority: PRIORITY_ORDER.includes(task.priority) ? task.priority : "medium",
      dueDate: isValidDateString(task.dueDate) ? task.dueDate : "",
      labels: normalizeLabels(task.labels),
    }));
  } catch {
    return [];
  }
}

async function persistTasks(nextTasks) {
  if (currentBoardId && supabaseClient) {
    const currentById = new Map(tasks.map((task) => [task.id, task]));
    const nextById = new Map(nextTasks.map((task) => [task.id, task]));
    const upserts = nextTasks
      .filter((task) => JSON.stringify(currentById.get(task.id)) !== JSON.stringify(task))
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        owner: task.owner,
        status: task.status,
        priority: task.priority,
        due_date: task.dueDate || null,
        labels: task.labels,
      }));
    const deletedIds = tasks.filter((task) => !nextById.has(task.id)).map((task) => task.id);

    if (upserts.length > 0 || deletedIds.length > 0) {
      const { error } = await supabaseClient.rpc("futari_apply_task_changes", {
        p_board_id: currentBoardId,
        p_upserts: upserts,
        p_deleted_ids: deletedIds,
      });
      if (error) {
        announce(`オンライン保存に失敗しました: ${error.message}`);
        return false;
      }
    }
    tasks = nextTasks;
    return true;
  }

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
  card.dataset.taskId = task.id;
  card.draggable = true;

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

  const meta = document.createElement("div");
  meta.className = "task-meta";
  const priority = document.createElement("span");
  priority.className = `priority-badge priority-${task.priority}`;
  priority.textContent = `優先度 ${PRIORITY_LABELS[task.priority]}`;
  meta.append(priority);
  if (task.dueDate) {
    const dueDate = document.createElement("time");
    const overdue = task.status !== "done" && task.dueDate < getLocalDateString();
    dueDate.className = `due-date${overdue ? " due-date-overdue" : ""}`;
    dueDate.dateTime = task.dueDate;
    dueDate.textContent = `${overdue ? "期限超過" : "期限"} ${new Intl.DateTimeFormat("ja-JP", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${task.dueDate}T00:00:00`))}`;
    meta.append(dueDate);
  }
  card.append(meta);

  if (task.labels.length > 0) {
    const labels = document.createElement("div");
    labels.className = "task-labels";
    for (const value of task.labels) {
      const label = document.createElement("span");
      label.className = "task-label";
      label.textContent = value;
      labels.append(label);
    }
    card.append(labels);
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
  const labelFilter = elements.labelFilter.value;
  const text = `${task.title} ${task.description} ${task.labels.join(" ")}`.toLocaleLowerCase("ja");
  return (!query || text.includes(query)) &&
    (ownerFilter === "all" || task.owner === ownerFilter) &&
    (labelFilter === "all" || task.labels.includes(labelFilter));
}

function render() {
  refreshLabelFilterOptions();
  const visibleTasks = tasks.filter(matchesFilters);

  for (const status of STATUS_ORDER) {
    const list = document.querySelector(`#${status}Tasks`);
    const statusTasks = visibleTasks
      .filter((task) => task.status === status)
      .sort((first, second) => (
        PRIORITY_ORDER.indexOf(first.priority) - PRIORITY_ORDER.indexOf(second.priority) ||
        (first.dueDate || "9999-12-31").localeCompare(second.dueDate || "9999-12-31")
      ));
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
  elements.priority.value = task?.priority || "medium";
  elements.dueDate.value = task?.dueDate || "";
  elements.labels.value = task?.labels?.join(", ") || "";
  elements.dialogTitle.textContent = task ? "タスクを編集" : "タスクを追加";
  elements.dialog.showModal();
  elements.title.focus();
}

async function handleBoardAction(event) {
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
    const deletedIndex = tasks.findIndex((item) => item.id === task.id);
    const nextTasks = tasks.filter((item) => item.id !== task.id);
    if (await persistTasks(nextTasks)) {
      render();
      pendingUndo = { task, index: deletedIndex };
      elements.undoMessage.textContent = `「${task.title}」を削除しました。`;
      elements.undoBar.hidden = false;
      announce(`「${task.title}」を削除しました。`);
      window.clearTimeout(undoTimer);
      undoTimer = window.setTimeout(() => {
        pendingUndo = null;
        elements.undoBar.hidden = true;
      }, 8000);
    }
  } else if (action === "move") {
    const nextPosition = STATUS_ORDER.indexOf(task.status) + (button.textContent.startsWith("次へ") ? 1 : -1);
    const nextStatus = STATUS_ORDER[nextPosition];
    const nextTasks = tasks.map((item) => item.id === task.id ? { ...item, status: nextStatus } : item);
    if (await persistTasks(nextTasks)) {
      render();
      announce(`${STATUS_LABELS[nextStatus]}に移動しました。`);
    }
  }
}

function setCloudMessage(message) {
  elements.cloudMessage.textContent = message;
}

function mapCloudTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    owner: row.owner === "dev-a" || row.owner === "dev-b" ? row.owner : "",
    status: STATUS_ORDER.includes(row.status) ? row.status : "backlog",
    priority: PRIORITY_ORDER.includes(row.priority) ? row.priority : "medium",
    dueDate: isValidDateString(row.due_date) ? row.due_date : "",
    labels: normalizeLabels(row.labels),
  };
}

async function refreshActiveBoard(boardId = currentBoardId) {
  if (!supabaseClient || !boardId || currentBoardId !== boardId) return;
  const { data, error } = await supabaseClient
    .from("futari_tasks")
    .select("id,title,description,owner,status,priority,due_date,labels")
    .eq("board_id", boardId)
    .order("created_at", { ascending: false });
  if (error) {
    setCloudMessage(`共有ボードを読み込めませんでした: ${error.message}`);
    return;
  }
  tasks = data.map(mapCloudTask);
  render();
  elements.importLocalTasks.hidden = readTasks().length === 0;
}

async function selectCloudBoard(boardId) {
  if (realtimeChannel && supabaseClient) {
    await supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  currentBoardId = boardId || null;
  elements.cloudBoardSelect.value = currentBoardId || "";
  elements.invitePanel.hidden = !currentBoardId;
  elements.inviteCode.value = "";
  elements.importLocalTasks.hidden = !currentBoardId || readTasks().length === 0;

  if (!currentBoardId) {
    try {
      localStorage.removeItem(ACTIVE_BOARD_KEY);
    } catch {
      // Local persistence may be disabled; the current selection still works.
    }
    tasks = readTasks();
    elements.cloudStatus.textContent = currentUser
      ? "サインイン中です。この端末に保存しています。"
      : "この端末に保存しています。";
    render();
    return;
  }

  try {
    localStorage.setItem(ACTIVE_BOARD_KEY, currentBoardId);
  } catch {
    // The selected board remains active for this page session.
  }
  const selectedBoardName = elements.cloudBoardSelect.selectedOptions[0]?.textContent || "共有ボード";
  elements.cloudStatus.textContent = `「${selectedBoardName}」に接続しています。`;
  tasks = [];
  render();
  await refreshActiveBoard(currentBoardId);

  const subscribedBoardId = currentBoardId;
  realtimeChannel = supabaseClient
    .channel(`futari-board-${subscribedBoardId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "futari_tasks",
      filter: `board_id=eq.${subscribedBoardId}`,
    }, () => { void refreshActiveBoard(subscribedBoardId); })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setCloudMessage("リアルタイム接続に失敗しました。画面を再読み込みしてください。");
      }
    });
}

async function loadCloudBoards(preferredBoardId = "") {
  const { data, error } = await supabaseClient
    .from("futari_boards")
    .select("id,name")
    .order("created_at", { ascending: true });
  if (error) {
    setCloudMessage(`共有ボード一覧を読み込めませんでした: ${error.message}`);
    return;
  }

  const rememberedBoardId = preferredBoardId || (() => {
    try { return localStorage.getItem(ACTIVE_BOARD_KEY) || ""; } catch { return ""; }
  })();
  elements.cloudBoardSelect.replaceChildren(
    new Option("この端末に保存する", ""),
    ...data.map((board) => new Option(board.name, board.id)),
  );
  const selectedBoardId = data.some((board) => board.id === rememberedBoardId) ? rememberedBoardId : "";
  await selectCloudBoard(selectedBoardId);
}

async function handleCloudSession(session) {
  currentUser = session?.user || null;
  elements.authForm.hidden = Boolean(currentUser);
  elements.cloudWorkspace.hidden = !currentUser;
  elements.signOut.hidden = !currentUser;
  if (!currentUser) {
    elements.cloudBoardSelect.replaceChildren(new Option("この端末に保存する", ""));
    await selectCloudBoard(null);
    return;
  }

  elements.signedInUser.textContent = `サインイン中: ${currentUser.email || "ユーザー"}`;
  setCloudMessage("");
  await loadCloudBoards();
}

async function initializeCloud() {
  if (!supabaseClient) {
    elements.authForm.hidden = true;
    elements.cloudStatus.textContent = "オンライン共有の設定を読み込めませんでした。";
    setCloudMessage("Supabaseクライアントまたは設定ファイルがありません。");
    return;
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => { void handleCloudSession(session); }, 0);
  });
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    setCloudMessage(`サインイン状態を確認できませんでした: ${error.message}`);
    return;
  }
  await handleCloudSession(data.session);
}

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = event.submitter?.dataset.authAction || "signin";
  const credentials = { email: elements.authEmail.value.trim(), password: elements.authPassword.value };
  const result = action === "signup"
    ? await supabaseClient.auth.signUp(credentials)
    : await supabaseClient.auth.signInWithPassword(credentials);
  if (result.error) {
    setCloudMessage(result.error.message);
    return;
  }
  if (action === "signup" && !result.data.session) {
    setCloudMessage("確認メールを送信しました。メール内のリンクを開いてからサインインしてください。");
    return;
  }
  await handleCloudSession(result.data.session);
});

elements.signOut.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();
  if (error) setCloudMessage(`サインアウトに失敗しました: ${error.message}`);
  else await handleCloudSession(null);
});

elements.cloudBoardSelect.addEventListener("change", () => {
  void selectCloudBoard(elements.cloudBoardSelect.value);
});

elements.createBoard.addEventListener("click", async () => {
  const { data, error } = await supabaseClient.rpc("futari_create_board", {
    p_name: elements.newBoardName.value.trim(),
  });
  if (error) {
    setCloudMessage(`共有ボードを作成できませんでした: ${error.message}`);
    return;
  }
  await loadCloudBoards(data.id);
  elements.inviteCode.value = data.invite_code;
  elements.invitePanel.hidden = false;
  setCloudMessage("共有ボードを作成しました。招待コードをもう1人に共有してください。");
});

elements.joinBoard.addEventListener("click", async () => {
  const { data: boardId, error } = await supabaseClient.rpc("futari_join_board", {
    p_invite_code: elements.joinCode.value.trim(),
  });
  if (error) {
    setCloudMessage(`ボードに参加できませんでした: ${error.message}`);
    return;
  }
  elements.joinCode.value = "";
  await loadCloudBoards(boardId);
  setCloudMessage("共有ボードに参加しました。");
});

elements.rotateInvite.addEventListener("click", async () => {
  if (!currentBoardId) return;
  const { data: inviteCode, error } = await supabaseClient.rpc("futari_rotate_invite_code", {
    p_board_id: currentBoardId,
  });
  if (error) {
    setCloudMessage(`招待コードを発行できませんでした: ${error.message}`);
    return;
  }
  elements.inviteCode.value = inviteCode;
  setCloudMessage("新しい招待コードを発行しました。前のコードは使えなくなりました。");
});

elements.copyInvite.addEventListener("click", async () => {
  if (!elements.inviteCode.value) return;
  try {
    await navigator.clipboard.writeText(elements.inviteCode.value);
    setCloudMessage("招待コードをコピーしました。");
  } catch {
    elements.inviteCode.focus();
    elements.inviteCode.select();
    setCloudMessage("招待コードを選択しました。コピーしてください。");
  }
});

elements.importLocalTasks.addEventListener("click", async () => {
  if (!currentBoardId) return;
  const localTasks = readTasks();
  const remoteIds = new Set(tasks.map((task) => task.id));
  const tasksToAdd = localTasks.filter((task) => !remoteIds.has(task.id));
  if (tasksToAdd.length === 0) {
    setCloudMessage("共有ボードに追加する新しいタスクはありません。");
    return;
  }
  if (!window.confirm(`この端末の${tasksToAdd.length}件のタスクを共有ボードに追加しますか？`)) return;
  if (await persistTasks([...tasks, ...tasksToAdd])) {
    render();
    setCloudMessage(`${tasksToAdd.length}件のタスクを共有ボードに追加しました。`);
  }
});

elements.board.addEventListener("click", handleBoardAction);
elements.board.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".task-card[data-task-id]");
  if (!card || !event.dataTransfer) return;
  event.dataTransfer.setData("text/plain", card.dataset.taskId);
  event.dataTransfer.effectAllowed = "move";
  card.classList.add("is-dragging");
});
elements.board.addEventListener("dragend", (event) => {
  event.target.closest(".task-card")?.classList.remove("is-dragging");
  document.querySelectorAll(".board-column.is-drop-target").forEach((column) => column.classList.remove("is-drop-target"));
});
elements.board.addEventListener("dragover", (event) => {
  const column = event.target.closest(".board-column[data-status]");
  if (!column) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".board-column.is-drop-target").forEach((item) => item.classList.toggle("is-drop-target", item === column));
});
elements.board.addEventListener("drop", async (event) => {
  const column = event.target.closest(".board-column[data-status]");
  const taskId = event.dataTransfer?.getData("text/plain");
  if (!column || !taskId) return;
  event.preventDefault();
  const task = tasks.find((item) => item.id === taskId);
  const nextStatus = column.dataset.status;
  if (!task || !STATUS_ORDER.includes(nextStatus) || task.status === nextStatus) return;
  const nextTasks = tasks.map((item) => item.id === taskId ? { ...item, status: nextStatus } : item);
  if (await persistTasks(nextTasks)) {
    render();
    announce(`${STATUS_LABELS[nextStatus]}に移動しました。`);
  }
});
document.querySelector("#openTaskDialog").addEventListener("click", () => openTaskDialog());
document.querySelector("#closeTaskDialog").addEventListener("click", () => elements.dialog.close());
document.querySelector("#cancelTaskDialog").addEventListener("click", () => elements.dialog.close());
elements.search.addEventListener("input", render);
elements.ownerFilter.addEventListener("change", render);
elements.labelFilter.addEventListener("change", render);
elements.undoDelete.addEventListener("click", async () => {
  if (!pendingUndo) return;
  if (tasks.some((task) => task.id === pendingUndo.task.id)) {
    announce("このタスクはすでにボードにあります。");
    return;
  }
  const nextTasks = [...tasks];
  nextTasks.splice(Math.min(pendingUndo.index, nextTasks.length), 0, pendingUndo.task);
  if (await persistTasks(nextTasks)) {
    window.clearTimeout(undoTimer);
    pendingUndo = null;
    elements.undoBar.hidden = true;
    render();
    announce("削除を取り消しました。");
  }
});
elements.importButton.addEventListener("click", () => elements.importFile.click());
elements.importFile.addEventListener("change", async () => {
  const file = elements.importFile.files?.[0];
  elements.importFile.value = "";
  if (!file) return;

  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported) || !imported.every(isValidImportedTask)) {
      announce("バックアップを読み込めませんでした。形式を確認してください。");
      return;
    }

    const normalized = imported.map((task) => ({
      id: task.id,
      title: task.title.trim().slice(0, 90),
      description: typeof task.description === "string" ? task.description.slice(0, 240) : "",
      owner: task.owner === "dev-a" || task.owner === "dev-b" ? task.owner : "",
      status: task.status,
      priority: PRIORITY_ORDER.includes(task.priority) ? task.priority : "medium",
      dueDate: isValidDateString(task.dueDate) ? task.dueDate : "",
      labels: normalizeLabels(task.labels),
    }));
    if (normalized.some((task) => !task.title) || new Set(normalized.map((task) => task.id)).size !== normalized.length) {
      announce("バックアップを読み込めませんでした。タスク名とIDを確認してください。");
      return;
    }
    if (!window.confirm(`現在のタスクを置き換えて、${normalized.length}件のタスクを読み込みますか？`)) return;

    if (await persistTasks(normalized)) {
      window.clearTimeout(undoTimer);
      pendingUndo = null;
      elements.undoBar.hidden = true;
      render();
      announce(`${normalized.length}件のタスクを読み込みました。`);
    }
  } catch {
    announce("バックアップを読み込めませんでした。JSONファイルを確認してください。");
  }
});
elements.exportButton.addEventListener("click", () => {
  const backup = new Blob([`${JSON.stringify(tasks, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(backup);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `futari-board-backup-${date}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce("タスクのバックアップを書き出しました。");
});

function isValidImportedTask(task) {
  return Boolean(
    task && typeof task === "object" && !Array.isArray(task) &&
    typeof task.id === "string" && task.id.length > 0 &&
    typeof task.title === "string" &&
    STATUS_ORDER.includes(task.status) &&
    (!task.priority || PRIORITY_ORDER.includes(task.priority)) &&
    (!task.dueDate || isValidDateString(task.dueDate))
  );
}

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function normalizeLabels(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .filter((value) => typeof value === "string")
    .map((value) => value.trim().slice(0, 20))
    .filter(Boolean))].slice(0, 8);
}

function refreshLabelFilterOptions() {
  const selected = elements.labelFilter.value;
  const labels = [...new Set(tasks.flatMap((task) => task.labels))]
    .sort((first, second) => first.localeCompare(second, "ja"));
  const options = [new Option("すべてのラベル", "all"), ...labels.map((label) => new Option(label, label))];
  elements.labelFilter.replaceChildren(...options);
  elements.labelFilter.value = labels.includes(selected) ? selected : "all";
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

elements.form.addEventListener("submit", async (event) => {
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
    priority: elements.priority.value,
    dueDate: elements.dueDate.value,
    labels: normalizeLabels(elements.labels.value.split(",")),
  };

  const nextTasks = editingId
    ? tasks.map((item) => item.id === editingId ? task : item)
    : [task, ...tasks];

  if (await persistTasks(nextTasks)) {
    elements.dialog.close();
    render();
    announce(editingId ? "タスクを更新しました。" : "タスクを追加しました。");
  }
});

window.addEventListener("storage", (event) => {
  if (!currentBoardId && (event.key === STORAGE_KEY || event.key === null)) {
    tasks = readTasks();
    render();
    announce(event.key === null
      ? "別のタブで保存データが消去されたため、タスクを更新しました。"
      : "別のタブでの変更を反映しました。");
  }
});

render();
void initializeCloud().catch((error) => {
  elements.authForm.hidden = true;
  setCloudMessage(`オンライン共有を初期化できませんでした: ${error.message}`);
});

