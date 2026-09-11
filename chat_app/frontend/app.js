const API_BASE = window.API_BASE || "http://localhost:8000";

const state = {
  chats: [],
  activeChatId: null,
  openMenuChatId: null,
  streaming: true,
};

const els = {
  sidebar: document.getElementById("sidebar"),
  menuToggle: document.getElementById("menu-toggle"),
  overlay: document.getElementById("overlay"),
  chatList: document.getElementById("chat-list"),
  newChatBtn: document.getElementById("new-chat-btn"),
  themeToggle: document.getElementById("theme-toggle"),
  themeLabel: document.getElementById("theme-toggle-label"),
  streamToggle: document.getElementById("stream-toggle"),
  streamLabel: document.getElementById("stream-toggle-label"),
  chatTitle: document.getElementById("chat-title"),
  messages: document.getElementById("messages"),
  input: document.getElementById("message-input"),
  sendBtn: document.getElementById("send-btn"),
};

// ---------- Theme ----------

function applyTheme(theme) {
  document.body.classList.toggle("theme-dark", theme === "dark");
  document.body.classList.toggle("theme-light", theme === "light");
  els.themeLabel.textContent = theme === "dark" ? "Light mode" : "Dark mode";
  localStorage.setItem("theme", theme);
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  applyTheme(saved === "light" ? "light" : "dark");
}

els.themeToggle.addEventListener("click", () => {
  const current = document.body.classList.contains("theme-dark") ? "dark" : "light";
  applyTheme(current === "dark" ? "light" : "dark");
});

// ---------- Streaming toggle ----------

function applyStreamingLabel() {
  els.streamLabel.textContent = state.streaming ? "Streaming: On" : "Streaming: Off";
}

els.streamToggle.addEventListener("click", () => {
  state.streaming = !state.streaming;
  applyStreamingLabel();
});

// ---------- Sidebar ----------

function openSidebar() {
  els.sidebar.classList.add("open");
  els.overlay.classList.add("visible");
}

function closeSidebar() {
  els.sidebar.classList.remove("open");
  els.overlay.classList.remove("visible");
  state.openMenuChatId = null;
}

els.menuToggle.addEventListener("click", () => {
  els.sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
});

els.overlay.addEventListener("click", closeSidebar);

// ---------- Markdown (minimal, safe) ----------

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function inlineMarkdown(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}

function parseMarkdown(text) {
  const lines = text.split("\n");
  let html = "";
  let inCodeBlock = false;
  let codeBuffer = [];
  let listBuffer = [];
  let listType = null;

  function flushList() {
    if (listBuffer.length) {
      const tag = listType === "ol" ? "ol" : "ul";
      html += `<${tag}>${listBuffer.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</${tag}>`;
      listBuffer = [];
      listType = null;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine;

    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        html += `<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`;
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      html += `<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`;
      continue;
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ulMatch) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listBuffer.push(ulMatch[1]);
      continue;
    }
    if (olMatch) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listBuffer.push(olMatch[1]);
      continue;
    }

    flushList();

    if (line.trim() === "") {
      continue;
    }

    html += `<p>${inlineMarkdown(line)}</p>`;
  }

  if (inCodeBlock) {
    html += `<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`;
  }
  flushList();

  return html;
}

// ---------- Rendering ----------

function formatTimestamp(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderChatList() {
  els.chatList.innerHTML = "";

  if (state.chats.length === 0) {
    const empty = document.createElement("div");
    empty.className = "chat-item-meta";
    empty.style.padding = "10px 12px";
    empty.textContent = "No chats yet";
    els.chatList.appendChild(empty);
    return;
  }

  for (const chat of state.chats) {
    const item = document.createElement("div");
    item.className = "chat-item" + (chat.chat_id === state.activeChatId ? " active" : "");

    const title = document.createElement("div");
    title.className = "chat-item-title";
    title.textContent = chat.title || "New Chat";

    const meta = document.createElement("div");
    meta.className = "chat-item-meta";
    meta.textContent = formatTimestamp(chat.updated_at);

    item.appendChild(title);
    item.appendChild(meta);

    const menuBtn = document.createElement("button");
    menuBtn.className = "chat-item-menu-btn";
    menuBtn.textContent = "⋯";
    menuBtn.setAttribute("aria-label", "Chat options");

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "chat-item-delete" + (state.openMenuChatId === chat.chat_id ? " visible" : "");
    deleteBtn.textContent = "Delete chat";

    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.openMenuChatId = state.openMenuChatId === chat.chat_id ? null : chat.chat_id;
      renderChatList();
    });

    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteChat(chat.chat_id);
    });

    item.appendChild(menuBtn);
    item.appendChild(deleteBtn);

    item.addEventListener("click", () => selectChat(chat.chat_id));

    els.chatList.appendChild(item);
  }
}

function renderMessages(messages) {
  els.messages.innerHTML = "";

  if (!messages || messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Start a new conversation";
    els.messages.appendChild(empty);
    return;
  }

  for (const msg of messages) {
    appendMessageBubble(msg.role, msg.content);
  }
  scrollToBottom();
}

function appendMessageBubble(role, content) {
  if (els.messages.querySelector(".empty-state")) {
    els.messages.innerHTML = "";
  }
  const row = document.createElement("div");
  row.className = "message-row " + (role === "user" ? "user" : "model");

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = parseMarkdown(content);

  row.appendChild(bubble);
  els.messages.appendChild(row);
  return row;
}

function appendTypingIndicator() {
  const row = document.createElement("div");
  row.className = "message-row model";
  row.id = "typing-row";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

  row.appendChild(bubble);
  els.messages.appendChild(row);
  scrollToBottom();
}

function removeTypingIndicator() {
  const row = document.getElementById("typing-row");
  if (row) row.remove();
}

function setChatTitle(title) {
  els.chatTitle.textContent = title || "";
}

function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

// ---------- API ----------

async function fetchChats() {
  const res = await fetch(`${API_BASE}/chats`);
  if (!res.ok) throw new Error("Failed to load chats");
  return res.json();
}

async function fetchChatMessages(chatId) {
  const res = await fetch(`${API_BASE}/chats/${chatId}`);
  if (!res.ok) throw new Error("Failed to load chat");
  return res.json();
}

async function deleteChatRequest(chatId) {
  const res = await fetch(`${API_BASE}/chats/${chatId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete chat");
}

async function postCompletion(chatId, content, stream) {
  const res = await fetch(`${API_BASE}/completions?stream=${stream}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, content }),
  });
  if (!res.ok) throw new Error("Failed to get completion");
  return res;
}

async function* readNdjson(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.trim()) yield JSON.parse(line);
    }
  }

  if (buffer.trim()) yield JSON.parse(buffer);
}

// ---------- Actions ----------

async function loadChatList() {
  try {
    state.chats = await fetchChats();
    renderChatList();
  } catch (err) {
    console.error(err);
  }
}

async function selectChat(chatId) {
  state.activeChatId = chatId;
  state.openMenuChatId = null;
  renderChatList();
  closeSidebar();
  try {
    const chat = await fetchChatMessages(chatId);
    setChatTitle(chat.title);
    renderMessages(chat.messages);
  } catch (err) {
    console.error(err);
  }
}

function startNewChat() {
  state.activeChatId = null;
  state.openMenuChatId = null;
  renderChatList();
  setChatTitle("");
  renderMessages([]);
  closeSidebar();
  els.input.focus();
}

async function deleteChat(chatId) {
  try {
    await deleteChatRequest(chatId);
    state.chats = state.chats.filter((c) => c.chat_id !== chatId);
    if (state.activeChatId === chatId) {
      state.activeChatId = null;
      renderMessages([]);
    }
    state.openMenuChatId = null;
    renderChatList();
  } catch (err) {
    console.error(err);
  }
}

async function sendMessage() {
  const content = els.input.value.trim();
  if (!content) return;

  els.input.value = "";
  autoResizeInput();
  els.sendBtn.disabled = true;

  appendMessageBubble("user", content);
  scrollToBottom();
  appendTypingIndicator();

  try {
    const res = await postCompletion(state.activeChatId, content, state.streaming);

    if (!state.streaming) {
      const result = await res.json();
      removeTypingIndicator();
      appendMessageBubble("model", result.content);
      scrollToBottom();
      state.activeChatId = result.chat_id;
    } else {
      let chatId = state.activeChatId;
      let fullContent = "";
      let bubbleRow = null;

      for await (const chunk of readNdjson(res)) {
        chatId = chunk.chat_id;
        fullContent += chunk.content;
        if (!bubbleRow) {
          removeTypingIndicator();
          bubbleRow = appendMessageBubble("model", fullContent);
        } else {
          bubbleRow.querySelector(".bubble").innerHTML = parseMarkdown(fullContent);
        }
        scrollToBottom();
      }

      if (!bubbleRow) removeTypingIndicator();
      state.activeChatId = chatId;
    }

    await loadChatList();
    const activeChat = state.chats.find((c) => c.chat_id === state.activeChatId);
    if (activeChat) setChatTitle(activeChat.title);
  } catch (err) {
    removeTypingIndicator();
    appendMessageBubble("model", "_Error: failed to reach the model. Please try again._");
    console.error(err);
  } finally {
    els.sendBtn.disabled = false;
    els.input.focus();
  }
}

// ---------- Input handling ----------

function autoResizeInput() {
  els.input.style.height = "auto";
  els.input.style.height = Math.min(els.input.scrollHeight, 200) + "px";
}

els.input.addEventListener("input", autoResizeInput);

els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

els.sendBtn.addEventListener("click", sendMessage);
els.newChatBtn.addEventListener("click", startNewChat);

document.addEventListener("click", (e) => {
  if (state.openMenuChatId && !e.target.closest(".chat-item")) {
    state.openMenuChatId = null;
    renderChatList();
  }
});

// ---------- Init ----------

initTheme();
applyStreamingLabel();
renderMessages([]);
loadChatList();
