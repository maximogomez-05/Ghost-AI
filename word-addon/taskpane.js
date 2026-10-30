// Ghost AI - Word Add-in Controller (Stealth Edition)
const STORAGE_KEY = "ghost_gemini_api_key";
const STORAGE_THEME = "ghost_addon_theme";
const STORAGE_OPACITY = "ghost_addon_opacity";

let currentRawMarkdown = "";
let currentRenderedHtml = "";
let currentPertOoxml = null;
let currentDiagramOoxml = null;
let chatHistory = [];
let chatTurns = [];
let activeTurnIndex = -1;

// Elements
const stealthContent = document.getElementById("stealth-content");
const panicZone = document.getElementById("panic-zone");
const promptInput = document.getElementById("prompt-input");
const exerciseType = document.getElementById("exercise-type");
const btnSolve = document.getElementById("btn-solve");
const btnClear = document.getElementById("btn-clear");
const btnGetSelection = document.getElementById("btn-get-selection");
const btnInsertWord = document.getElementById("btn-insert-word");
const btnInsertDrawing = document.getElementById("btn-insert-drawing");
const btnCopyClipboard = document.getElementById("btn-copy-clipboard");
const resultContainer = document.getElementById("result-container");
const resultView = document.getElementById("result-view");
const loadingBox = document.getElementById("loading");

// History Navigation & Pinned Header Elements (v3.7)
const pinnedHistoryBanner = document.getElementById("pinned-history-banner");
const btnPinnedPrev = document.getElementById("btn-pinned-prev");
const pinnedPrevTitle = document.getElementById("pinned-prev-title");
const pinnedNextBanner = document.getElementById("pinned-next-banner");
const btnPinnedNext = document.getElementById("btn-pinned-next");
const pinnedNextTitle = document.getElementById("pinned-next-title");
const btnTurnPrev = document.getElementById("btn-turn-prev");
const btnTurnNext = document.getElementById("btn-turn-next");
const turnBadge = document.getElementById("turn-badge");
const turnUserBox = document.getElementById("turn-user-box");
const turnUserText = document.getElementById("turn-user-text");
const modelBadge = document.getElementById("model-badge");
const cardModelFooter = document.getElementById("card-model-footer");

// Antigravity Remote & Engine Elements
const engineSelect = document.getElementById("engine-select");
const bridgeStatusBadge = document.getElementById("bridge-status-badge");
const btnRemote = document.getElementById("btn-remote");
const remoteModal = document.getElementById("remote-modal");
const btnRemoteClose = document.getElementById("btn-remote-close");
const btnCopyRemoteUrl = document.getElementById("btn-copy-remote-url");
const remoteUrlDisplay = document.getElementById("remote-url-display");
const btnCloudDownload = document.getElementById("btn-cloud-download");

let isBridgeOnline = false;
let remoteNetworkUrl = "http://localhost:7777/remote";

const STORAGE_WORD_HOST_MODE = "ghost_word_host_mode";
const STORAGE_WORD_REMOTE_HOST = "ghost_word_remote_host";

function getWordHostMode() {
  return localStorage.getItem(STORAGE_WORD_HOST_MODE) || "local";
}

function getWordRemoteHost() {
  return localStorage.getItem(STORAGE_WORD_REMOTE_HOST) || "http://192.168.1.55:7777";
}

function getEffectiveBridgeUrl() {
  const mode = getWordHostMode();
  if (mode === "remote") {
    let host = (getWordRemoteHost() || "").trim();
    if (host.endsWith("/")) host = host.slice(0, -1);
    return host || "http://192.168.1.55:7777";
  }
  return "http://localhost:7777";
}

async function checkBridgeStatus() {
  const baseUrl = getEffectiveBridgeUrl();
  try {
    const res = await fetch(`${baseUrl}/api/status`);
    const data = await res.json();
    if (data.ok) {
      isBridgeOnline = true;
      if (bridgeStatusBadge) {
        bridgeStatusBadge.style.display = "inline";
        const mode = getWordHostMode();
        bridgeStatusBadge.textContent = mode === "remote" ? "📡 Remoto Online" : "● Antigravity Online";
      }
      if (data.networkUrl) {
        remoteNetworkUrl = data.networkUrl;
        if (remoteUrlDisplay) remoteUrlDisplay.textContent = data.networkUrl;
      }
    } else {
      isBridgeOnline = false;
      if (bridgeStatusBadge) bridgeStatusBadge.style.display = "none";
    }
  } catch (e) {
    isBridgeOnline = false;
    if (bridgeStatusBadge) bridgeStatusBadge.style.display = "none";
  }
}
checkBridgeStatus();
setInterval(checkBridgeStatus, 10000);

// Toast Feedback Notification
const toastEl = document.getElementById("toast");
let toastTimer = null;
function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 2500);
}

// Stealth Bar Controls
const stealthBar = document.getElementById("stealth-bar");
const btnTheme = document.getElementById("btn-theme");
const opacitySlider = document.getElementById("opacity-slider");
const opacityVal = document.getElementById("opacity-val");

// Force top bar to strictly 0% opacity by default (reveals only on hover)
if (stealthBar) {
  stealthBar.style.opacity = "0";
  stealthBar.style.transition = "opacity 0.15s ease";

  stealthBar.addEventListener("mouseenter", () => {
    stealthBar.style.opacity = "1";
  });
  stealthBar.addEventListener("mouseleave", () => {
    stealthBar.style.opacity = "0";
  });
}

// Settings Modal elements
const btnSettings = document.getElementById("btn-settings");
const apiModal = document.getElementById("api-modal");
const modalKeyInput = document.getElementById("modal-key-input");
const btnModalSave = document.getElementById("btn-modal-save");
const btnModalCancel = document.getElementById("btn-modal-cancel");

// Initialize Office.js
Office.onReady((info) => {
  if (info.host === Office.HostType.Word) {
    console.log("Add-in ready inside Word.");
  }
});

// Theme Management (Monochrome Moon/Sun symbol)
function applyTheme(theme) {
  if (theme === "dark") {
    document.body.classList.remove("theme-light");
    document.body.classList.add("theme-dark");
    btnTheme.textContent = "☼";
    btnTheme.title = "Cambiar a modo claro (☼)";
  } else {
    document.body.classList.remove("theme-dark");
    document.body.classList.add("theme-light");
    btnTheme.textContent = "☾";
    btnTheme.title = "Cambiar a modo oscuro (☾)";
  }
  localStorage.setItem(STORAGE_THEME, theme);
}

btnTheme.addEventListener("click", () => {
  const isDark = document.body.classList.contains("theme-dark");
  applyTheme(isDark ? "light" : "dark");
});

// Opacity & Panic Mode (Esc & Right-Edge Proximity)
let lastActiveOpacity = 20;
let isPanicHidden = false;

function applyOpacity(val, remember = true) {
  const clamped = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
  if (stealthContent) {
    stealthContent.style.opacity = (clamped / 100).toString();
    stealthContent.style.pointerEvents = clamped === 0 ? "none" : "auto";
  }
  opacityVal.textContent = clamped + "%";
  opacitySlider.value = clamped;

  if (clamped === 0) {
    isPanicHidden = true;
    document.body.classList.add("panic-mode");
  } else {
    isPanicHidden = false;
    document.body.classList.remove("panic-mode");
    if (remember) {
      lastActiveOpacity = clamped;
      localStorage.setItem(STORAGE_OPACITY, clamped);
    }
  }
}

function triggerPanic() {
  if (!isPanicHidden && (parseInt(opacitySlider.value, 10) > 0)) {
    lastActiveOpacity = Math.max(20, parseInt(opacitySlider.value, 10) || 20);
    applyOpacity(0, false);
  }
}

function restorePanic() {
  const restoreVal = Math.max(20, lastActiveOpacity || 20);
  applyOpacity(restoreVal, true);
}

function togglePanic() {
  if (isPanicHidden || parseInt(opacitySlider.value, 10) === 0) {
    restorePanic();
  } else {
    triggerPanic();
  }
}

// Right-Edge Proximity Trigger: moving mouse to extreme right edge drops to 0% and locks
if (panicZone) {
  panicZone.addEventListener("mouseenter", () => {
    if (!isPanicHidden) triggerPanic();
  });
}

window.addEventListener("mousemove", (e) => {
  // Only trigger panic if cursor is below the top bar (clientY > 45) and at the right edge
  if (!isPanicHidden && e.clientY > 45 && e.clientX >= (window.innerWidth - 18)) {
    triggerPanic();
  }
});

// Global key listener inside add-in for 'Escape' key
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    togglePanic();
  }
});

opacitySlider.addEventListener("input", (e) => {
  applyOpacity(e.target.value, true);
});

// Load saved preferences
const savedTheme = localStorage.getItem(STORAGE_THEME) || "light";
applyTheme(savedTheme);

const savedOpacity = localStorage.getItem(STORAGE_OPACITY) || "20";
lastActiveOpacity = Math.max(20, parseInt(savedOpacity, 10) || 20);
applyOpacity(lastActiveOpacity, true);

// API Key & Host Management
function getApiKey() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

const wordRadioLocal = document.getElementById("word-radio-local");
const wordRadioRemote = document.getElementById("word-radio-remote");
const wordRemoteHostInput = document.getElementById("word-remote-host-input");

function syncWordHostUI() {
  const mode = getWordHostMode();
  if (mode === "remote") {
    if (wordRadioRemote) wordRadioRemote.checked = true;
    if (wordRemoteHostInput) wordRemoteHostInput.style.display = "block";
  } else {
    if (wordRadioLocal) wordRadioLocal.checked = true;
    if (wordRemoteHostInput) wordRemoteHostInput.style.display = "none";
  }
  if (wordRemoteHostInput) wordRemoteHostInput.value = getWordRemoteHost();
}

if (wordRadioLocal) {
  wordRadioLocal.addEventListener("change", () => {
    if (wordRemoteHostInput) wordRemoteHostInput.style.display = "none";
  });
}

if (wordRadioRemote) {
  wordRadioRemote.addEventListener("change", () => {
    if (wordRemoteHostInput) {
      wordRemoteHostInput.style.display = "block";
      wordRemoteHostInput.focus();
    }
  });
}

btnSettings.addEventListener("click", () => {
  modalKeyInput.value = getApiKey();
  syncWordHostUI();
  apiModal.classList.add("active");
  modalKeyInput.focus();
});

btnModalCancel.addEventListener("click", () => {
  apiModal.classList.remove("active");
});

btnModalSave.addEventListener("click", () => {
  const val = modalKeyInput.value.trim();
  if (!val) {
    alert("Por favor ingresa una API Key válida de Gemini.");
    return;
  }
  localStorage.setItem(STORAGE_KEY, val);

  const mode = (wordRadioRemote && wordRadioRemote.checked) ? "remote" : "local";
  const remoteHostVal = wordRemoteHostInput ? (wordRemoteHostInput.value.trim() || "http://192.168.1.55:7777") : "http://192.168.1.55:7777";
  localStorage.setItem(STORAGE_WORD_HOST_MODE, mode);
  localStorage.setItem(STORAGE_WORD_REMOTE_HOST, remoteHostVal);

  apiModal.classList.remove("active");
  showToast(`✓ Ajustes guardados (${mode === "remote" ? "Remoto: " + remoteHostVal : "Local"})`);
  checkBridgeStatus();
});

// Remote Modal Controls
if (btnRemote) {
  btnRemote.addEventListener("click", () => {
    checkBridgeStatus();
    if (remoteModal) remoteModal.classList.add("active");
  });
}
if (btnRemoteClose) {
  btnRemoteClose.addEventListener("click", () => {
    if (remoteModal) remoteModal.classList.remove("active");
  });
}
if (btnCopyRemoteUrl) {
  btnCopyRemoteUrl.addEventListener("click", () => {
    navigator.clipboard.writeText(remoteNetworkUrl);
    showToast("✅ Enlace remoto copiado");
    if (btnCopyRemoteUrl) btnCopyRemoteUrl.textContent = "¡Copiado!";
    setTimeout(() => {
      if (btnCopyRemoteUrl) btnCopyRemoteUrl.textContent = "Copiar Enlace";
    }, 2000);
  });
}

// Cloud Download (HTTPS Remote Export)
if (btnCloudDownload) {
  btnCloudDownload.addEventListener("click", async () => {
    const activeTurn = (chatTurns && activeTurnIndex >= 0 && chatTurns[activeTurnIndex]) ? chatTurns[activeTurnIndex] : null;
    const markdownToExport = activeTurn ? activeTurn.rawMarkdown : currentRawMarkdown;
    const promptToExport = activeTurn ? activeTurn.userPrompt : promptInput.value;

    if (!markdownToExport) {
      showToast("No hay resolución para exportar");
      return;
    }

    showToast("☁️ Generando enlace remoto...");
    const baseUrl = getEffectiveBridgeUrl();
    try {
      const res = await fetch(`${baseUrl}/api/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Resolución Word Oficial",
          exerciseText: promptToExport || "Ejercicio Resuelto",
          markdown: markdownToExport,
          format: "docx"
        })
      });
      const data = await res.json();
      if (data.ok && data.url) {
        navigator.clipboard.writeText(data.url);
        showToast("✅ Link copiado: " + data.url);
        window.open(data.url, "_blank");
      } else {
        showToast("❌ No se pudo subir el archivo: " + (data.error || "Error"));
      }
    } catch (err) {
      showToast("❌ Error con el puente (" + baseUrl + "): " + err.message);
    }
  });
}

// Clear input and reset conversational memory
btnClear.addEventListener("click", () => {
  promptInput.value = "";
  resultContainer.style.display = "none";
  currentRawMarkdown = "";
  currentRenderedHtml = "";
  currentPertOoxml = null;
  currentDiagramOoxml = null;
  chatHistory = [];
  chatTurns = [];
  activeTurnIndex = -1;
  btnSolve.textContent = "Resolver Paso a Paso";
  promptInput.placeholder = "Selecciona el ejercicio en tu hoja de Word y toca 'Tomar de Word', o pega la consigna aquí...";
  if (btnInsertDrawing) btnInsertDrawing.style.display = "none";
  if (pinnedHistoryBanner) pinnedHistoryBanner.style.display = "none";
  if (pinnedNextBanner) pinnedNextBanner.style.display = "none";
  if (resultView) resultView.innerHTML = "";
});

// Take selection from Word document
btnGetSelection.addEventListener("click", async () => {
  if (typeof Word !== "undefined" && Word.run) {
    try {
      await Word.run(async (context) => {
        const selection = context.document.getSelection();
        selection.load("text");
        await context.sync();
        if (selection.text && selection.text.trim()) {
          promptInput.value = selection.text.trim();
        } else {
          alert("Resalta primero el texto de la consigna en tu hoja de Word.");
        }
      });
      return;
    } catch (e) {
      console.warn("Word.run getSelection fallback:", e);
    }
  }

  // Fallback Office.js API
  if (typeof Office !== "undefined" && Office.context && Office.context.document) {
    Office.context.document.getSelectedDataAsync(Office.CoercionType.Text, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded && result.value) {
        promptInput.value = result.value.trim();
      } else {
        alert("Resalta primero el texto de la consigna en tu hoja de Word.");
      }
    });
  } else {
    alert("Para usar esta función, abre el complemento dentro de Word.");
  }
});

// Helper function to prepare native Word HTML elements (Tables, Boxes, Arrows)
function prepareWordHtml(html) {
  let clean = html;

  // 0. Remove hidden HTML comments (e.g. PERT_DATA)
  clean = clean.replace(/<!--[\s\S]*?-->/g, "");

  // 1. Remove code blocks (<pre><code>) if any, converting them into clean normal text
  clean = clean.replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (match, code) => {
    return `<div style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; padding: 6px 0; margin: 6px 0; line-height: 1.35;">${code}</div>`;
  });

  // 2. Remove LaTeX commands, raw math codes and dollar signs
  clean = clean.replace(/\\implies/g, " ➔ ")
               .replace(/\\rightarrow/g, " ➔ ")
               .replace(/-->/g, " ➔ ")
               .replace(/->/g, " ➔ ")
               .replace(/\\max/g, "max")
               .replace(/\\min/g, "min")
               .replace(/\\text\{([^}]+)\}/g, "$1")
               .replace(/\$([^\$]+)\$/g, "$1");

  // 3. Format square brackets like [ A: 3 meses ] into real bordered Word boxes (Cuadros de Word)
  clean = clean.replace(/\[\s*([^\]\<\>]+?)\s*\]/g, (match, text) => {
    if (text.startsWith("http") || text.length > 60 || text.includes("\n")) return match;
    const isCritical = text.includes("*") || text.toLowerCase().includes("crític");
    const bg = isCritical ? "#e2e8f0" : "#ffffff";
    const border = isCritical ? "2px solid #000000" : "1.5px solid #000000";
    return `<span style="display: inline-block; border: ${border}; background-color: ${bg}; padding: 3px 8px; margin: 3px 4px; font-weight: bold; font-family: 'Times New Roman', Times, serif; font-size: 11pt; text-align: center; border-radius: 2px;">${text}</span>`;
  });

  // 4. Ensure real native Word tables with clean black borders and cell shading (Times New Roman 11pt)
  clean = clean.replace(/<table[^>]*>/gi, '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1.5px solid #000000; margin: 12px 0; font-family: \'Times New Roman\', Times, serif; font-size: 11pt;">');
  clean = clean.replace(/<th[^>]*>/gi, '<th style="border: 1px solid #000000; background-color: #f2f2f2; font-weight: bold; padding: 6px 8px; text-align: center; color: #000000; font-family: \'Times New Roman\', Times, serif; font-size: 11pt;">');
  clean = clean.replace(/<td[^>]*>/gi, '<td style="border: 1px solid #000000; padding: 5px 8px; text-align: center; color: #000000; font-family: \'Times New Roman\', Times, serif; font-size: 11pt;">');

  return clean;
}

// Insert solution directly into Word document
btnInsertWord.addEventListener("click", async () => {
  if (!currentRenderedHtml) {
    alert("No hay desarrollo generado para insertar.");
    return;
  }

  // Academic styling for native Word document insertion (Times New Roman 12pt según manual de cátedra)
  const styledHtml = `
    <div style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; color: #000000; line-height: 1.35;">
      <h3 style="font-family: 'Times New Roman', Times, serif; font-size: 14pt; color: #000000; border-bottom: 2px solid #000000; padding-bottom: 4px; margin-top: 14px;">
        Desarrollo y Resolución Técnica
      </h3>
      ${currentRenderedHtml}
    </div>
  `;

  if (typeof Word !== "undefined" && Word.run) {
    try {
      await Word.run(async (context) => {
        const selection = context.document.getSelection();
        const range = selection.insertHtml(styledHtml, Word.InsertLocation.replace);
        range.select("End");
        await context.sync();
      });
      showToast("✓ Desarrollo insertado en el cursor");
      return;
    } catch (e) {
      console.warn("Word.run insertHtml fallback:", e);
    }
  }

  // Fallback Office.js API
  if (typeof Office !== "undefined" && Office.context && Office.context.document) {
    Office.context.document.setSelectedDataAsync(styledHtml, { coercionType: Office.CoercionType.Html }, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        showToast("✓ Desarrollo insertado en el cursor");
      } else {
        alert("Error al insertar en Word: " + result.error.message);
      }
    });
  } else {
    // If testing in standard browser outside Word
    navigator.clipboard.writeText(currentRawMarkdown);
    showToast("✓ Copiado al portapapeles");
  }
});

// Copy to clipboard
btnCopyClipboard.addEventListener("click", () => {
  if (!currentRawMarkdown) return;
  navigator.clipboard.writeText(currentRawMarkdown).then(() => {
    showToast("✓ Copiado al portapapeles");
  });
});

// ==========================================
// Full PERT Graph & DrawingML OOXML Generator
// ==========================================
function parsePertTable(markdownText) {
  // 1. Try parsing from hidden HTML comment first
  const commentMatch = markdownText.match(/<!--\s*PERT_DATA:\s*([\s\S]*?)-->/);
  if (commentMatch) {
    try {
      const data = JSON.parse(commentMatch[1].trim());
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (e) {
      console.warn("Failed to parse PERT_DATA comment:", e);
    }
  }

  // 2. Fallback: Parse markdown table
  const lines = markdownText.split("\n");
  const activities = [];
  let tableFound = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
      if (tableFound && activities.length > 0) break;
      continue;
    }

    const cells = trimmed.split("|").slice(1, -1).map(c => c.trim().replace(/\*\*/g, "").replace(/\*/g, ""));
    if (cells.length < 8) continue;

    const firstCell = cells[0].toLowerCase();
    if (firstCell.includes("actividad") || firstCell.includes("tarea") || firstCell.includes("nodo")) {
      tableFound = true;
      continue;
    }
    if (cells[0].includes("---") || cells[0].includes(":-")) {
      continue;
    }

    if (!tableFound) continue;

    const id = cells[0].replace(/[^a-zA-Z0-9_]/g, "").toUpperCase();
    if (!id || id.length > 10) continue;

    const predStr = cells[1];
    const preds = (predStr === "-" || predStr.toLowerCase().includes("ningun") || !predStr)
      ? []
      : predStr.split(/[,;\s]+/).map(p => p.replace(/[^a-zA-Z0-9_]/g, "").toUpperCase()).filter(Boolean);

    const t = parseFloat(cells[2]) || 0;
    const es = parseFloat(cells[3]) || 0;
    const ef = parseFloat(cells[4]) || 0;
    const ls = parseFloat(cells[5]) || 0;
    const lf = parseFloat(cells[6]) || 0;
    const h = parseFloat(cells[7]) || (lf - ef);
    const crit = (cells[8] && (cells[8].toLowerCase().includes("s") || cells[8].toLowerCase().includes("crít"))) || (h === 0);

    activities.push({ id, act: id, t, pred: preds, es, ef, ls, lf, h, crit });
  }

  return activities;
}

// ==========================================
// DECISION TREE DATA PARSER & OOXML BUILDER
// ==========================================

function flattenHierarchicalTree(root) {
  if (!root) return null;
  const nodes = [];
  const edges = [];
  let idCounter = 1;

  function traverse(item, parentId = null, edgeLabel = "", edgeProb = "", edgeCost = "") {
    const id = "N" + (idCounter++);
    const ntype = item.type || ((item.children && item.children.length > 0) ? "chance" : "terminal");
    const label = item.name || item.label || id;
    const vme = item.vme ? String(item.vme) : "";
    const payoff = (item.payout !== undefined || item.payoff !== undefined) 
      ? String(item.payout ?? item.payoff) 
      : "";

    nodes.push({ id, type: ntype, label, vme, payoff });

    if (parentId) {
      edges.push({
        from: parentId,
        to: id,
        label: edgeLabel,
        prob: edgeProb,
        cost: edgeCost,
        optimal: false
      });
    }

    if (Array.isArray(item.children)) {
      item.children.forEach(ch => {
        let chLabel = ch.name || ch.label || "";
        let chProb = "";
        let chCost = "";
        const probMatch = chLabel.match(/\((0\.\d+|1(?:\.0+)?|\d+[\/\.]\d+)\)/);
        if (probMatch) {
          chProb = probMatch[1];
          chLabel = chLabel.replace(probMatch[0], "").trim();
        }
        traverse(ch, id, chLabel, chProb, chCost);
      });
    }
  }

  traverse(root);
  return { nodes, edges };
}

function parseTreeFromTrajectoryTable(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const rows = [];
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const parts = line.split("|").map(p => p.trim());
    if (parts.length >= 3) {
      let traj = parts.find(p => p.includes("→") || p.includes("->"));
      const payoff = parts[parts.length - 1];
      
      if (!traj && parts.length >= 4 && parts[1] && !parts[1].toLowerCase().includes("camino") && !parts[1].toLowerCase().includes("nodo")) {
        traj = parts[1];
      }

      if (traj && payoff && /^[+-]?\d+/.test(payoff)) {
        rows.push({
          path: traj.split(/→|->/).map(s => s.trim()).filter(Boolean),
          payoff: payoff
        });
      }
    }
  }

  if (rows.length < 2) return null;

  const root = { id: "root", type: "decision", label: "Decidir", children: {} };
  let counter = 1;

  rows.forEach(r => {
    let curr = root;
    for (let i = 0; i < r.path.length; i++) {
      const step = r.path[i];
      if (!curr.children[step]) {
        const isLast = (i === r.path.length - 1);
        curr.children[step] = {
          id: "N" + (counter++),
          label: step,
          type: isLast ? "terminal" : "chance",
          payoff: isLast ? r.payoff : "",
          children: {}
        };
      }
      curr = curr.children[step];
    }
  });

  const nodes = [];
  const edges = [];

  function traverse(node) {
    nodes.push({
      id: node.id,
      type: node.type,
      label: node.label,
      payoff: node.payoff || "",
      vme: ""
    });

    Object.keys(node.children).forEach(branchLabel => {
      const child = node.children[branchLabel];
      edges.push({
        from: node.id,
        to: child.id,
        label: branchLabel,
        prob: "",
        cost: "",
        optimal: false
      });
      traverse(child);
    });
  }

  traverse(root);
  return { nodes, edges };
}

function parseTreeData(markdownText) {
  if (!markdownText) return null;

  // 1. Primary: Extract from hidden HTML comment
  const commentMatch = markdownText.match(/<!--\s*(?:TREE_DATA|ARBOL_DATA|DECISION_TREE|TREE):\s*([\s\S]*?)-->/i);
  let rawJson = null;
  if (commentMatch) {
    rawJson = commentMatch[1].trim();
  } else {
    // 2. Check for JSON code block
    const codeMatch = markdownText.match(/```(?:json)?\s*(\{\s*[\s\S]*?\})\s*```/i);
    if (codeMatch) rawJson = codeMatch[1].trim();
  }

  if (rawJson) {
    try {
      rawJson = rawJson.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      rawJson = rawJson.replace(/,\s*([\]}])/g, "$1");
      const data = JSON.parse(rawJson);
      // Flat graph format
      if (data && Array.isArray(data.nodes) && Array.isArray(data.edges) && data.nodes.length >= 2) {
        return data;
      }
      // Hierarchical tree format
      if (data && (Array.isArray(data.children) || data.name || data.label)) {
        return flattenHierarchicalTree(data);
      }
    } catch (e) {
      console.warn("Failed to parse TREE_DATA JSON:", e);
    }
  }

  // 3. Fallback: Parse from Markdown table of trajectories & terminal payoffs
  const tableTree = parseTreeFromTrajectoryTable(markdownText);
  if (tableTree && tableTree.nodes && tableTree.nodes.length >= 2) {
    return tableTree;
  }

  return null;
}

function escapeXml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildDecisionTreeOoxml(treeData) {
  if (!treeData || !treeData.nodes || treeData.nodes.length < 2) return null;

  const nodesDict = {};
  const children = {};
  const parents = {};

  treeData.nodes.forEach(n => {
    const nid = String(n.id).trim();
    n._id = nid;
    nodesDict[nid] = n;
    children[nid] = [];
    parents[nid] = [];
  });

  (treeData.edges || []).forEach(e => {
    const u = String(e.from).trim();
    const v = String(e.to).trim();
    if (!nodesDict[u]) {
      const newNode = { id: u, _id: u, type: "chance", label: u, vme: "", payoff: "" };
      nodesDict[u] = newNode;
      treeData.nodes.push(newNode);
      children[u] = [];
      parents[u] = [];
    }
    if (!nodesDict[v]) {
      const newNode = { id: v, _id: v, type: "terminal", label: v, vme: "", payoff: "" };
      nodesDict[v] = newNode;
      treeData.nodes.push(newNode);
      children[v] = [];
      parents[v] = [];
    }
    if (children[u]) children[u].push(v);
    if (parents[v]) parents[v].push(u);
  });

  // Reclassify: If any node has children, it CANNOT be terminal!
  treeData.nodes.forEach(n => {
    const nid = n._id;
    if ((children[nid] || []).length > 0 && n.type === "terminal") {
      n.type = "chance";
    }
  });

  // Find root node (node with 0 parents)
  const roots = treeData.nodes.filter(n => parents[n._id].length === 0);
  const rootId = roots.length > 0 ? roots[0]._id : treeData.nodes[0]._id;

  // BFS / DFS depths (guarantees every node gets a numeric depth)
  const depth = {};
  depth[rootId] = 0;
  const queue = [rootId];
  const visitedDepth = new Set([rootId]);
  while (queue.length > 0) {
    const curr = queue.shift();
    const d = depth[curr];
    (children[curr] || []).forEach(ch => {
      if (nodesDict[ch] && !visitedDepth.has(ch)) {
        visitedDepth.add(ch);
        depth[ch] = d + 1;
        queue.push(ch);
      }
    });
  }

  // Default depth for any unreachable nodes
  Object.keys(nodesDict).forEach(nid => {
    if (depth[nid] === undefined) depth[nid] = 1;
  });

  const maxDepth = Math.max(...Object.values(depth), 1);

  // DFS leaf ordering for 100% planar non-crossing layout
  const leaves = [];
  function dfsLeaves(curr, vis = new Set()) {
    if (vis.has(curr)) return;
    vis.add(curr);
    const chList = (children[curr] || []).filter(ch => nodesDict[ch]);
    if (chList.length === 0) {
      leaves.push(curr);
      return;
    }
    chList.forEach(ch => dfsLeaves(ch, vis));
  }
  dfsLeaves(rootId);

  // Ensure any unreachable leaves are included
  Object.keys(nodesDict).forEach(nid => {
    if (!leaves.includes(nid) && (children[nid] || []).length === 0) {
      leaves.push(nid);
    }
  });

  // Vertical coordinates
  const yStart = 240000;
  const deltaY = 400000; // ~1.11 cm per leaf row
  const yPos = {};
  leaves.forEach((leafId, idx) => {
    yPos[leafId] = yStart + idx * deltaY;
  });

  function assignInternalY(curr, vis = new Set()) {
    if (vis.has(curr)) return yPos[curr] || yStart;
    vis.add(curr);
    const chList = (children[curr] || []).filter(ch => nodesDict[ch]);
    if (chList.length === 0) {
      return yPos[curr] || yStart;
    }
    const chYs = chList.map(ch => assignInternalY(ch, vis));
    const currY = Math.round(chYs.reduce((s, v) => s + v, 0) / Math.max(1, chYs.length));
    yPos[curr] = currY;
    return currY;
  }
  assignInternalY(rootId);

  // Fallback Y for any remaining node
  Object.keys(nodesDict).forEach((nid, idx) => {
    if (yPos[nid] === undefined || isNaN(yPos[nid])) {
      yPos[nid] = yStart + idx * deltaY;
    }
  });

  // Horizontal coordinates (dynamic step to fit standard Word margins)
  const xStart = 140000;
  const deltaX = Math.min(1400000, Math.max(1100000, Math.floor(5200000 / Math.max(1, maxDepth))));
  const xPos = {};
  Object.keys(nodesDict).forEach(nid => {
    xPos[nid] = xStart + (depth[nid] || 0) * deltaX;
  });

  const decSize = 260000;    // ~0.72 cm (Cuadrado decisión)
  const chanceSize = 260000; // ~0.72 cm (Círculo azar)
  const termSize = 160000;   // ~0.45 cm (Triángulo terminal)
  const payoffW = 950000;
  const payoffH = 180000;

  // IMPORTANT: docPr uses id="8000". Shapes start at 1001 so there are ZERO duplicate IDs!
  const docPrId = 8000;
  let shapeCounter = 1001;
  const shapesXml = [];
  const nodeShapeIds = {};

  // 1. Draw Nodes first so every node gets an exact shapeId
  treeData.nodes.forEach(n => {
    const nid = n._id;
    const ntype = n.type || "decision";
    const x = Math.round(xPos[nid] || xStart);
    const y = Math.round(yPos[nid] || yStart);
    const nodeShapeId = shapeCounter++;
    nodeShapeIds[nid] = nodeShapeId;

    const rawLabel = String(n.label || nid || "");
    const rawVme = String(n.vme || "");
    const vmeTxt = escapeXml(rawVme);

    // Format clean identifier inside node shape (e.g. "D1", "D2", "C1", "1", "2")
    let displayInside = nid;
    if (displayInside.length > 4 || displayInside.includes(" ")) {
      const shortMatch = rawLabel.match(/\b([A-Za-z]?\d+)\b/);
      if (shortMatch) {
        displayInside = shortMatch[1];
      } else {
        displayInside = ntype === "decision" ? "D" : "C";
      }
    }
    const insideTxt = escapeXml(displayInside);

    if (ntype === "decision") {
      // Cuadrado de decisión
      shapesXml.push(`
        <wps:wsp>
          <wps:cNvPr id="${nodeShapeId}" name="S${nodeShapeId}"/>
          <wps:cNvSpPr/>
          <wps:spPr>
            <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${decSize}" cy="${decSize}"/></a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            <a:solidFill><a:srgbClr val="F0F4F8"/></a:solidFill>
            <a:ln w="19050"><a:solidFill><a:srgbClr val="1E3A8A"/></a:solidFill></a:ln>
          </wps:spPr>
          <wps:txbx>
            <w:txbxContent>
              <w:p>
                <w:pPr>
                  <w:jc w:val="center"/>
                  <w:spacing w:line="160" w:lineRule="auto" w:before="0" w:after="0"/>
                  <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="15"/><w:color w:val="1E3A8A"/></w:rPr>
                </w:pPr>
                <w:r>
                  <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="15"/><w:color w:val="1E3A8A"/></w:rPr>
                  <w:t>${insideTxt}</w:t>
                </w:r>
              </w:p>
            </w:txbxContent>
          </wps:txbx>
          <wps:bodyPr anchor="ctr" lIns="2000" rIns="2000" tIns="2000" bIns="2000"/>
        </wps:wsp>
      `);

      if (vmeTxt) {
        const vmeId = shapeCounter++;
        shapesXml.push(`
          <wps:wsp>
            <wps:cNvPr id="${vmeId}" name="S${vmeId}"/>
            <wps:cNvSpPr/>
            <wps:spPr>
              <a:xfrm><a:off x="${x - 150000}" y="${y - 150000}"/><a:ext cx="${decSize + 300000}" cy="140000"/></a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              <a:ln><a:noFill/></a:ln>
            </wps:spPr>
            <wps:txbx>
              <w:txbxContent>
                <w:p>
                  <w:pPr>
                    <w:jc w:val="center"/>
                    <w:spacing w:line="140" w:lineRule="auto" w:before="0" w:after="0"/>
                    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="13"/><w:color w:val="1E3A8A"/></w:rPr>
                  </w:pPr>
                  <w:r>
                    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="13"/><w:color w:val="1E3A8A"/></w:rPr>
                    <w:t>[${vmeTxt}]</w:t>
                  </w:r>
                </w:p>
              </w:txbxContent>
            </wps:txbx>
            <wps:bodyPr anchor="ctr" lIns="1000" rIns="1000" tIns="1000" bIns="1000"/>
          </wps:wsp>
        `);
      }
    } else if (ntype === "chance") {
      // Círculo de azar
      shapesXml.push(`
        <wps:wsp>
          <wps:cNvPr id="${nodeShapeId}" name="S${nodeShapeId}"/>
          <wps:cNvSpPr/>
          <wps:spPr>
            <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${chanceSize}" cy="${chanceSize}"/></a:xfrm>
            <a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>
            <a:solidFill><a:srgbClr val="FEF3C7"/></a:solidFill>
            <a:ln w="19050"><a:solidFill><a:srgbClr val="D97706"/></a:solidFill></a:ln>
          </wps:spPr>
          <wps:txbx>
            <w:txbxContent>
              <w:p>
                <w:pPr>
                  <w:jc w:val="center"/>
                  <w:spacing w:line="160" w:lineRule="auto" w:before="0" w:after="0"/>
                  <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="15"/><w:color w:val="92400E"/></w:rPr>
                </w:pPr>
                <w:r>
                  <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="15"/><w:color w:val="92400E"/></w:rPr>
                  <w:t>${insideTxt}</w:t>
                </w:r>
              </w:p>
            </w:txbxContent>
          </wps:txbx>
          <wps:bodyPr anchor="ctr" lIns="2000" rIns="2000" tIns="2000" bIns="2000"/>
        </wps:wsp>
      `);

      if (vmeTxt) {
        const vmeId = shapeCounter++;
        shapesXml.push(`
          <wps:wsp>
            <wps:cNvPr id="${vmeId}" name="S${vmeId}"/>
            <wps:cNvSpPr/>
            <wps:spPr>
              <a:xfrm><a:off x="${x - 150000}" y="${y - 150000}"/><a:ext cx="${chanceSize + 300000}" cy="140000"/></a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              <a:ln><a:noFill/></a:ln>
            </wps:spPr>
            <wps:txbx>
              <w:txbxContent>
                <w:p>
                  <w:pPr>
                    <w:jc w:val="center"/>
                    <w:spacing w:line="140" w:lineRule="auto" w:before="0" w:after="0"/>
                    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="13"/><w:color w:val="B45309"/></w:rPr>
                  </w:pPr>
                  <w:r>
                    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="13"/><w:color w:val="B45309"/></w:rPr>
                    <w:t>VME=${vmeTxt}</w:t>
                  </w:r>
                </w:p>
              </w:txbxContent>
            </wps:txbx>
            <wps:bodyPr anchor="ctr" lIns="1000" rIns="1000" tIns="1000" bIns="1000"/>
          </wps:wsp>
        `);
      }
    } else if (ntype === "terminal") {
      // Triángulo terminal apuntando a la derecha
      const rawPayoff = String(n.payoff || "");
      const payoffVal = escapeXml(rawPayoff || rawLabel);
      const isNegative = payoffVal.includes("-");
      const payoffClr = isNegative ? "991B1B" : "166534";

      shapesXml.push(`
        <wps:wsp>
          <wps:cNvPr id="${nodeShapeId}" name="S${nodeShapeId}"/>
          <wps:cNvSpPr/>
          <wps:spPr>
            <a:xfrm rot="5400000"><a:off x="${x}" y="${y}"/><a:ext cx="${termSize}" cy="${termSize}"/></a:xfrm>
            <a:prstGeom prst="triangle"><a:avLst/></a:prstGeom>
            <a:solidFill><a:srgbClr val="${payoffClr}"/></a:solidFill>
            <a:ln w="12700"><a:solidFill><a:srgbClr val="${payoffClr}"/></a:solidFill></a:ln>
          </wps:spPr>
          <wps:bodyPr/>
        </wps:wsp>
      `);

      // Payoff text box right next to triangle
      const payId = shapeCounter++;
      shapesXml.push(`
        <wps:wsp>
          <wps:cNvPr id="${payId}" name="S${payId}"/>
          <wps:cNvSpPr/>
          <wps:spPr>
            <a:xfrm><a:off x="${x + termSize + 40000}" y="${y - 20000}"/><a:ext cx="${payoffW}" cy="${payoffH}"/></a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            <a:ln><a:noFill/></a:ln>
          </wps:spPr>
          <wps:txbx>
            <w:txbxContent>
              <w:p>
                <w:pPr>
                  <w:jc w:val="left"/>
                  <w:spacing w:line="160" w:lineRule="auto" w:before="0" w:after="0"/>
                  <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="16"/><w:color w:val="${payoffClr}"/></w:rPr>
                </w:pPr>
                <w:r>
                  <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="16"/><w:color w:val="${payoffClr}"/></w:rPr>
                  <w:t>${payoffVal}</w:t>
                </w:r>
              </w:p>
            </w:txbxContent>
          </wps:txbx>
          <wps:bodyPr anchor="ctr" lIns="1000" rIns="1000" tIns="1000" bIns="1000"/>
        </wps:wsp>
      `);
    }
  });

  // 2. Draw Connectors and Labels
  (treeData.edges || []).forEach(e => {
    const u = String(e.from).trim();
    const v = String(e.to).trim();
    const uNode = nodesDict[u];
    const vNode = nodesDict[v];
    if (!uNode || !vNode) return;

    const uType = uNode.type || "decision";
    const vType = vNode.type || "terminal";

    const uW = uType === "decision" ? decSize : chanceSize;
    const x1 = Math.round((xPos[u] || xStart) + uW);
    const y1 = Math.round((yPos[u] || yStart) + Math.floor(uW / 2));

    const x2 = Math.round(xPos[v] || (xStart + deltaX));
    const vW = vType === "terminal" ? termSize : (vType === "decision" ? decSize : chanceSize);
    const y2 = Math.round((yPos[v] || yStart) + Math.floor(vW / 2));

    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const cx = Math.max(12700, Math.abs(x2 - x1));
    const cy = Math.max(12700, Math.abs(y2 - y1));
    const flipH = x2 < x1 ? ' flipH="1"' : '';
    const flipV = y2 < y1 ? ' flipV="1"' : '';

    const connId = shapeCounter++;
    const isOptimal = !!e.optimal;
    const lineW = isOptimal ? 25400 : 12700;
    const lineClr = isOptimal ? "0284C7" : "333333";

    shapesXml.push(`
      <wps:wsp>
        <wps:cNvPr id="${connId}" name="S${connId}"/>
        <wps:cNvSpPr/>
        <wps:spPr>
          <a:xfrm${flipH}${flipV}><a:off x="${minX}" y="${minY}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
          <a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>
          <a:ln w="${lineW}">
            <a:solidFill><a:srgbClr val="${lineClr}"/></a:solidFill>
          </a:ln>
        </wps:spPr>
        <wps:bodyPr/>
      </wps:wsp>
    `);

    // Branch Label
    const rawLbl = String(e.label || "");
    const rawProb = String(e.prob || "");
    const rawCost = String(e.cost || "");

    const lblText = escapeXml(rawLbl);
    const probText = escapeXml(rawProb);
    const costText = escapeXml(rawCost);

    const hasSub = !!(probText || (costText && costText !== "0"));
    const subText = probText ? `p = ${probText}` : ((costText && costText !== "0") ? `[${costText}]` : "");

    if (lblText || subText) {
      const lblId = shapeCounter++;
      const midX = Math.floor((x1 + x2) / 2);
      const midY = Math.floor((y1 + y2) / 2);
      const lblW = Math.min(1100000, cx);
      const lblH = hasSub ? 220000 : 150000;
      const lblX = Math.max(minX, midX - Math.floor(lblW / 2));
      const lblY = midY - lblH - 10000;

      const optBold = isOptimal ? '<w:b/>' : '';
      const optColor = isOptimal ? `<w:color w:val="${lineClr}"/>` : '<w:color w:val="1E293B"/>';

      let subP = "";
      if (hasSub) {
        subP = `
          <w:p>
            <w:pPr>
              <w:jc w:val="center"/>
              <w:spacing w:line="130" w:lineRule="auto" w:before="0" w:after="0"/>
              <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="13"/><w:color w:val="475569"/></w:rPr>
            </w:pPr>
            <w:r>
              <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="13"/><w:color w:val="475569"/></w:rPr>
              <w:t>${subText}</w:t>
            </w:r>
          </w:p>
        `;
      }

      shapesXml.push(`
        <wps:wsp>
          <wps:cNvPr id="${lblId}" name="S${lblId}"/>
          <wps:cNvSpPr/>
          <wps:spPr>
            <a:xfrm><a:off x="${lblX}" y="${lblY}"/><a:ext cx="${lblW}" cy="${lblH}"/></a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            <a:ln><a:noFill/></a:ln>
          </wps:spPr>
          <wps:txbx>
            <w:txbxContent>
              <w:p>
                <w:pPr>
                  <w:jc w:val="center"/>
                  <w:spacing w:line="140" w:lineRule="auto" w:before="0" w:after="0"/>
                  <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="14"/>${optBold}${optColor}</w:rPr>
                </w:pPr>
                <w:r>
                  <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="14"/>${optBold}${optColor}</w:rPr>
                  <w:t>${lblText}</w:t>
                </w:r>
              </w:p>
              ${subP}
            </w:txbxContent>
          </wps:txbx>
          <wps:bodyPr anchor="ctr" lIns="1000" rIns="1000" tIns="1000" bIns="1000"/>
        </wps:wsp>
      `);
    }
  });

  const allX = Object.values(xPos);
  const allY = Object.values(yPos);
  const maxX = Math.max(...allX) + payoffW + termSize + 150000;
  const maxY = Math.max(...allY) + termSize + 200000;

  const drawingXml = `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
      xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
      <wp:inline>
        <wp:extent cx="${maxX}" cy="${maxY}"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="${docPrId}" name="ArbolDecision"/>
        <wp:cNvGraphicFramePr><a:graphicFrameLocks/></wp:cNvGraphicFramePr>
        <a:graphic>
          <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup">
            <wpg:wgp>
              <wpg:cNvGrpSpPr/>
              <wpg:grpSpPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="${maxX}" cy="${maxY}"/>
                  <a:chOff x="0" y="0"/>
                  <a:chExt cx="${maxX}" cy="${maxY}"/>
                </a:xfrm>
              </wpg:grpSpPr>
              ${shapesXml.join("")}
            </wpg:wgp>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  `;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">
  <pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml" pkg:padding="512">
    <pkg:xmlData>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>
    </pkg:xmlData>
  </pkg:part>
  <pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml">
    <pkg:xmlData>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
                  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
                  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
                  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
        <w:body>
          <w:p>
            <w:r>
              ${drawingXml}
            </w:r>
          </w:p>
        </w:body>
      </w:document>
    </pkg:xmlData>
  </pkg:part>
</pkg:package>`;
}

function buildFullPertOoxmlFromActivities(rawActivities) {
  if (!rawActivities || rawActivities.length === 0) return null;

  const acts = rawActivities.map(a => ({ ...a, pred: [...a.pred] }));

  // Ensure INICIO node
  const roots = acts.filter(a => a.pred.length === 0 && a.id !== "INICIO");
  let hasInicio = acts.some(a => a.id === "INICIO");
  if (!hasInicio && roots.length > 0) {
    acts.unshift({
      id: "INICIO",
      act: "INICIO",
      t: 0,
      pred: [],
      es: 0,
      ef: 0,
      ls: 0,
      lf: 0,
      h: 0,
      crit: true
    });
    roots.forEach(r => r.pred.push("INICIO"));
  }

  // Ensure FIN node
  const allPreds = new Set();
  acts.forEach(a => a.pred.forEach(p => allPreds.add(p)));
  const terminals = acts.filter(a => !allPreds.has(a.id) && a.id !== "FIN");
  let hasFin = acts.some(a => a.id === "FIN");
  if (!hasFin && terminals.length > 0) {
    const maxEf = Math.max(...acts.map(a => a.ef || 0));
    acts.push({
      id: "FIN",
      act: "FIN",
      t: 0,
      pred: terminals.map(t => t.id),
      es: maxEf,
      ef: maxEf,
      ls: maxEf,
      lf: maxEf,
      h: 0,
      crit: true
    });
  }

  // 1. Successor mapping
  const succs = {};
  acts.forEach(a => { succs[a.id] = []; });
  acts.forEach(a => {
    a.pred.forEach(p => {
      if (succs[p]) succs[p].push(a.id);
    });
  });

  // 2. Topological Levels (Col X)
  const levels = {};
  function getLevel(actId, visited = new Set()) {
    if (levels[actId] !== undefined) return levels[actId];
    if (visited.has(actId)) return 0;
    visited.add(actId);

    const act = acts.find(a => a.id === actId);
    if (!act || act.pred.length === 0) {
      levels[actId] = 0;
      return 0;
    }

    const lvl = Math.max(...act.pred.map(p => getLevel(p, visited))) + 1;
    levels[actId] = lvl;
    return lvl;
  }
  acts.forEach(a => getLevel(a.id));

  // 2.1 Algorithmic CPM Engine: Recalculates and verifies ES, EF, LS, LF, h, crit
  // This guarantees 100% mathematical perfection regardless of LLM text anomalies
  const forwardOrder = [...acts].sort((a, b) => levels[a.id] - levels[b.id]);
  forwardOrder.forEach(a => {
    if (a.pred.length === 0) {
      a.es = 0;
    } else {
      a.es = Math.max(...a.pred.map(p => acts.find(x => x.id === p)?.ef || 0));
    }
    a.ef = a.es + (a.t || 0);
  });

  const finNode = acts.find(a => a.id === "FIN");
  const projectDuration = finNode ? finNode.ef : Math.max(...acts.map(a => a.ef || 0));

  const backwardOrder = [...acts].sort((a, b) => levels[b.id] - levels[a.id]);
  backwardOrder.forEach(a => {
    const sList = succs[a.id] || [];
    if (sList.length === 0) {
      a.lf = projectDuration;
    } else {
      a.lf = Math.min(...sList.map(sId => acts.find(x => x.id === sId)?.ls ?? projectDuration));
    }
    a.ls = a.lf - (a.t || 0);
    a.h = a.lf - a.ef;
    a.crit = (a.h === 0);
  });

  // 3. Find all paths from INICIO to FIN
  const allPaths = [];
  function dfsPaths(curr, path) {
    if (curr === "FIN") {
      allPaths.push([...path]);
      return;
    }
    const children = succs[curr] || [];
    for (const s of children) {
      dfsPaths(s, [...path, s]);
    }
  }
  dfsPaths("INICIO", ["INICIO"]);

  function isPathCrit(path) {
    return path.every(nid => {
      const a = acts.find(x => x.id === nid);
      return a ? a.crit : false;
    });
  }

  // Group paths by root branch
  const rootBranches = [];
  allPaths.forEach(p => {
    const rootNode = p.length > 1 ? p[1] : "FIN";
    if (!rootBranches.includes(rootNode)) {
      rootBranches.push(rootNode);
    }
  });

  const critRoot = allPaths.find(p => isPathCrit(p) && p.length > 1)?.[1] || rootBranches[0];
  const reorderedRootBranches = [critRoot, ...rootBranches.filter(r => r !== critRoot)];

  const sortedPaths = [];
  reorderedRootBranches.forEach(rb => {
    const rbPaths = allPaths.filter(p => p.length > 1 && p[1] === rb);
    rbPaths.sort((p1, p2) => {
      const c1 = isPathCrit(p1) ? 1 : 0;
      const c2 = isPathCrit(p2) ? 1 : 0;
      if (c1 !== c2) return c2 - c1;
      return p2.length - p1.length;
    });
    sortedPaths.push(...rbPaths);
  });

  const nodePathCount = {};
  sortedPaths.forEach(p => {
    p.forEach(nid => {
      nodePathCount[nid] = (nodePathCount[nid] || 0) + 1;
    });
  });

  const tracks = {};
  let currentTrack = 0;

  sortedPaths.forEach(p => {
    const middle = p.filter(nid => nid !== "INICIO" && nid !== "FIN");
    const unassigned = middle.filter(nid => tracks[nid] === undefined && nodePathCount[nid] === 1);
    if (unassigned.length > 0) {
      unassigned.forEach(nid => {
        tracks[nid] = currentTrack;
      });
      currentTrack++;
    }
  });

  const multiNodes = acts.filter(a => tracks[a.id] === undefined && a.id !== "INICIO" && a.id !== "FIN");
  multiNodes.forEach(a => {
    const nid = a.id;
    const chTracks = (succs[nid] || []).filter(c => tracks[c] !== undefined).map(c => tracks[c]);
    const prTracks = (a.pred || []).filter(p => tracks[p] !== undefined).map(p => tracks[p]);
    const combined = [...chTracks, ...prTracks];
    if (combined.length > 0) {
      tracks[nid] = combined.reduce((sum, v) => sum + v, 0) / combined.length;
    } else {
      tracks[nid] = currentTrack++;
    }
  });

  const incTracks = (succs["INICIO"] || []).filter(c => tracks[c] !== undefined).map(c => tracks[c]);
  tracks["INICIO"] = incTracks.length > 0 ? (incTracks.reduce((s, v) => s + v, 0) / incTracks.length) : 0;

  const finAct = acts.find(a => a.id === "FIN");
  const finTracks = (finAct?.pred || []).filter(p => tracks[p] !== undefined).map(p => tracks[p]);
  tracks["FIN"] = finTracks.length > 0 ? (finTracks.reduce((s, v) => s + v, 0) / finTracks.length) : 0;

  // 4. Geometry & Compact Spacing (Fits inside standard Word margins)
  const nodeW = 480000;      // ~1.33 cm
  const boxW = Math.floor(nodeW / 2); // 240000
  const boxH = 140000;      // ~0.39 cm
  const hH = 110000;        // ~0.30 cm
  const rowH = boxH * 3 + hH;
  const gapY = 120000;      // ~0.33 cm
  const stepY = rowH + gapY; // 650000

  const gapX = 220000;      // ~0.61 cm
  const stepX = nodeW + gapX; // 700000

  const placedNodes = [];
  acts.forEach(a => {
    const col = levels[a.id] || 0;
    const tr = tracks[a.id] !== undefined ? tracks[a.id] : 0;
    a.x = col * stepX;
    a.y = Math.round(tr * stepY);
    placedNodes.push(a);
  });

  // 5. Build edges
  const edges = [];
  acts.forEach(a => {
    a.pred.forEach(p => {
      const srcNode = placedNodes.find(n => n.id === p);
      if (srcNode) {
        const isCrit = a.crit && srcNode.crit;
        edges.push([p, a.id, isCrit]);
      }
    });
  });

  let maxX = 0;
  let maxY = 0;
  placedNodes.forEach(n => {
    if (n.x + nodeW > maxX) maxX = n.x + nodeW;
    if (n.y + boxH * 3 + hH > maxY) maxY = n.y + boxH * 3 + hH;
  });
  maxX += 100000;
  maxY += 100000;

  let shapeCounter = 1000;
  const shapesXml = [];
  const nodeMidShapeIds = {};

  function makeBox(sId, x, y, cx, cy, text, isCrit, isBorderless, isBold) {
    const lnXml = isBorderless
      ? '<a:ln><a:noFill/></a:ln>'
      : `<a:ln w="${isCrit ? 19000 : 12700}"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>`;
    const fillXml = isCrit && !isBorderless
      ? '<a:solidFill><a:srgbClr val="F0F4F8"/></a:solidFill>'
      : '<a:solidFill><a:schemeClr val="lt1"/></a:solidFill>';
    const bTag = isBold ? '<w:b/>' : '';

    return `
      <wps:wsp>
        <wps:cNvPr id="${sId}" name="B${sId}"/>
        <wps:cNvSpPr/>
        <wps:spPr>
          <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          ${fillXml}
          ${lnXml}
        </wps:spPr>
        <wps:txbx>
          <w:txbxContent>
            <w:p>
              <w:pPr>
                <w:jc w:val="center"/>
                <w:spacing w:line="180" w:lineRule="auto" w:before="0" w:after="0"/>
                <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="15"/>${bTag}</w:rPr>
              </w:pPr>
              <w:r>
                <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="15"/>${bTag}</w:rPr>
                <w:t>${text}</w:t>
              </w:r>
            </w:p>
          </w:txbxContent>
        </wps:txbx>
        <wps:bodyPr anchor="ctr" lIns="2000" rIns="2000" tIns="2000" bIns="2000"/>
      </wps:wsp>
    `;
  }

  placedNodes.forEach(n => {
    const nx = n.x;
    const ny = n.y;
    const crit = n.crit;

    shapesXml.push(makeBox(shapeCounter++, nx, ny, boxW, boxH, String(n.es), crit, false, false));
    shapesXml.push(makeBox(shapeCounter++, nx + boxW, ny, boxW, boxH, String(n.ef), crit, false, false));
    const sMid = shapeCounter++;
    nodeMidShapeIds[n.id] = sMid;
    const actLbl = n.t > 0 ? `${n.act} (t=${n.t})` : n.act;
    shapesXml.push(makeBox(sMid, nx, ny + boxH, nodeW, boxH, actLbl, crit, false, true));
    shapesXml.push(makeBox(shapeCounter++, nx, ny + boxH * 2, boxW, boxH, String(n.ls), crit, false, false));
    shapesXml.push(makeBox(shapeCounter++, nx + boxW, ny + boxH * 2, boxW, boxH, String(n.lf), crit, false, false));
    shapesXml.push(makeBox(shapeCounter++, nx + Math.floor((nodeW - 300000) / 2), ny + boxH * 3, 300000, hH, `h=${n.h}`, crit, true, crit));
  });

  edges.forEach(([src, dst, isCrit]) => {
    const srcId = nodeMidShapeIds[src];
    const dstId = nodeMidShapeIds[dst];
    const srcNode = placedNodes.find(n => n.id === src);
    const dstNode = placedNodes.find(n => n.id === dst);
    if (!srcNode || !dstNode) return;

    // Always exit from right center of source and enter left center of destination
    const stIdx = 3; // exit right center
    const endIdx = 1; // enter left center
    const x1 = srcNode.x + nodeW;
    const y1 = srcNode.y + boxH + Math.floor(boxH / 2);
    const x2 = dstNode.x;
    const y2 = dstNode.y + boxH + Math.floor(boxH / 2);

    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const cx = Math.max(12700, Math.abs(x2 - x1));
    const cy = Math.max(12700, Math.abs(y2 - y1));
    const flipH = x2 < x1 ? ' flipH="1"' : '';
    const flipV = y2 < y1 ? ' flipV="1"' : '';

    const connId = shapeCounter++;
    const lw = isCrit ? 25000 : 12700;

    shapesXml.push(`
      <wps:wsp>
        <wps:cNvPr id="${connId}" name="F${connId}"/>
        <wps:cNvCnPr><a:stCxn id="${srcId}" idx="${stIdx}"/><a:endCxn id="${dstId}" idx="${endIdx}"/></wps:cNvCnPr>
        <wps:spPr>
          <a:xfrm${flipH}${flipV}><a:off x="${minX}" y="${minY}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
          <a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>
          <a:ln w="${lw}">
            <a:solidFill><a:srgbClr val="000000"/></a:solidFill>
            <a:tailEnd type="triangle" w="med" len="med"/>
          </a:ln>
        </wps:spPr>
        <wps:bodyPr/>
      </wps:wsp>
    `);
  });

  const drawingXml = `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
      xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
      <wp:inline>
        <wp:extent cx="${maxX}" cy="${maxY}"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="5000" name="Red PERT Organizada"/>
        <wp:cNvGraphicFramePr><a:graphicFrameLocks/></wp:cNvGraphicFramePr>
        <a:graphic>
          <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup">
            <wpg:wgp>
              <wpg:cNvGrpSpPr/>
              <wpg:grpSpPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="${maxX}" cy="${maxY}"/>
                  <a:chOff x="0" y="0"/>
                  <a:chExt cx="${maxX}" cy="${maxY}"/>
                </a:xfrm>
              </wpg:grpSpPr>
              ${shapesXml.join("")}
            </wpg:wgp>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  `;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">
  <pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml" pkg:padding="512">
    <pkg:xmlData>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>
    </pkg:xmlData>
  </pkg:part>
  <pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml">
    <pkg:xmlData>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
                  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
                  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
                  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
        <w:body>
          <w:p>
            <w:r>
              ${drawingXml}
            </w:r>
          </w:p>
        </w:body>
      </w:document>
    </pkg:xmlData>
  </pkg:part>
</pkg:package>`;
}

// Button: Insert Generated Vector Drawing (PERT or Decision Tree)
if (btnInsertDrawing) {
  btnInsertDrawing.addEventListener("click", async () => {
    const ooxmlToInsert = currentDiagramOoxml || currentPertOoxml;
    if (!ooxmlToInsert) {
      showToast("No hay diagrama generado para insertar.");
      return;
    }

    let inserted = false;

    // 1. Primary method: Word.run with insertOoxml
    if (typeof Word !== "undefined" && Word.run) {
      try {
        await Word.run(async (context) => {
          const selection = context.document.getSelection();
          const range = selection.insertOoxml(ooxmlToInsert, Word.InsertLocation.replace);
          range.select("End");
          await context.sync();
        });
        inserted = true;
        showToast("✓ Diagrama vectorial insertado en la posición del cursor");
        return;
      } catch (e) {
        console.warn("Word.run insertOoxml failed, attempting fallback:", e);
      }
    }

    // 2. Secondary method: setSelectedDataAsync fallback
    if (!inserted && typeof Office !== "undefined" && Office.context && Office.context.document) {
      Office.context.document.setSelectedDataAsync(ooxmlToInsert, { coercionType: Office.CoercionType.Ooxml }, (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          showToast("✓ Diagrama vectorial insertado en la posición del cursor");
        } else {
          console.error("setSelectedDataAsync error:", result.error);
          showToast("Error al insertar: ubica el cursor en un párrafo vacío fuera de tablas o figuras y reintenta.");
        }
      });
      return;
    }

    if (!inserted) {
      showToast("Abre el complemento dentro de Word para insertar.");
    }
  });
}



// Display a specific conversation turn and update pinned headers
function showTurn(idx) {
  if (idx < 0 || idx >= chatTurns.length) return;
  activeTurnIndex = idx;
  const turn = chatTurns[idx];

  // 1. Sync active data for Word insertion and copy
  currentRawMarkdown = turn.responseMarkdown;
  currentRenderedHtml = turn.renderedHtml;
  currentDiagramOoxml = turn.diagramOoxml || turn.pertOoxml;
  currentPertOoxml = currentDiagramOoxml;

  // 2. Update user query box
  if (turnUserText) turnUserText.textContent = turn.query;

  // 3. Render markdown HTML into resultView
  if (resultView) {
    resultView.innerHTML = turn.renderedHtml;
    resultView.scrollTop = 0;
  }

  // 4. Update Vector Drawing button (PERT or Decision Tree)
  if (btnInsertDrawing) {
    const hasDiag = !!currentDiagramOoxml;
    btnInsertDrawing.style.display = hasDiag ? "block" : "none";
    if (turn.diagramType) {
      btnInsertDrawing.textContent = "Insertar " + turn.diagramType;
      btnInsertDrawing.title = "Inserta el " + turn.diagramType + " vectorial en tu cursor";
    } else {
      btnInsertDrawing.textContent = "Insertar Diagrama";
      btnInsertDrawing.title = "Inserta el diagrama vectorial en tu cursor";
    }
  }

  // 5. Update Turn Badge
  if (turnBadge) {
    turnBadge.textContent = `Consulta ${idx + 1} de ${chatTurns.length}`;
  }

  // 6. Navigation Buttons state
  if (btnTurnPrev) btnTurnPrev.disabled = (idx <= 0);
  if (btnTurnNext) btnTurnNext.disabled = (idx >= chatTurns.length - 1);

  // 7. Pinned Previous Consultation Header (Sticky above current response)
  if (pinnedHistoryBanner && pinnedPrevTitle) {
    if (idx > 0) {
      const prevTurn = chatTurns[idx - 1];
      const snippet = (prevTurn.query || "").replace(/\s+/g, " ").trim();
      const shortSnippet = snippet.length > 45 ? snippet.slice(0, 42) + "..." : snippet;
      pinnedPrevTitle.textContent = `#${idx}: "${shortSnippet}"`;
      pinnedHistoryBanner.style.display = "block";
    } else {
      pinnedHistoryBanner.style.display = "none";
    }
  }

  // 8. Pinned Next Consultation Banner (When browsing past turns)
  if (pinnedNextBanner && pinnedNextTitle) {
    if (idx < chatTurns.length - 1) {
      const nextTurn = chatTurns[idx + 1];
      const snippet = (nextTurn.query || "").replace(/\s+/g, " ").trim();
      const shortSnippet = snippet.length > 45 ? snippet.slice(0, 42) + "..." : snippet;
      pinnedNextTitle.textContent = `#${idx + 2}: "${shortSnippet}"`;
      pinnedNextBanner.style.display = "block";
    } else {
      pinnedNextBanner.style.display = "none";
    }
  }

  // 9. Update model indicator in header and card footer
  const modelUsed = turn.modelUsed || "gemini-3.8-flash";
  if (modelBadge) {
    modelBadge.textContent = modelUsed;
  }
  if (cardModelFooter) {
    cardModelFooter.textContent = "⚡ Modelo: " + modelUsed;
  }

  resultContainer.style.display = "flex";
}

// Navigation button listeners
if (btnPinnedPrev) {
  btnPinnedPrev.addEventListener("click", () => {
    if (activeTurnIndex > 0) showTurn(activeTurnIndex - 1);
  });
}
if (btnPinnedNext) {
  btnPinnedNext.addEventListener("click", () => {
    if (activeTurnIndex < chatTurns.length - 1) showTurn(activeTurnIndex + 1);
  });
}
if (btnTurnPrev) {
  btnTurnPrev.addEventListener("click", () => {
    if (activeTurnIndex > 0) showTurn(activeTurnIndex - 1);
  });
}
if (btnTurnNext) {
  btnTurnNext.addEventListener("click", () => {
    if (activeTurnIndex < chatTurns.length - 1) showTurn(activeTurnIndex + 1);
  });
}

// Solve exercise & Multi-turn Conversational Memory
btnSolve.addEventListener("click", async () => {
  const query = promptInput.value.trim();
  if (!query) {
    alert("Por favor ingresa o selecciona la consigna o tu pregunta de seguimiento.");
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    apiModal.classList.add("active");
    alert("Debes configurar tu Gemini API Key primero.");
    return;
  }

  // Format prompt based on whether it is a fresh problem or a follow-up
  let userPrompt = "";
  if (chatHistory.length === 0) {
    const type = exerciseType.value;
    userPrompt = buildOperationalResearchPrompt(query, type);
  } else {
    userPrompt = `PREGUNTA O AJUSTE DE SEGUIMIENTO SOBRE EL EJERCICIO ANTERIOR:
${query}

REGLAS DE FORMATO:
- Mantén la coherencia matemática estricta con el ejercicio anterior.
- Responde directamente al pedido con explicaciones claras o tablas actualizadas.
- Si presentas tablas, usa formato Markdown completo para Microsoft Word.
- CERO bloques de código (\`\`\`), CERO LaTeX crudo ($).
- Si se modifican actividades de la red PERT, incluye al final el bloque actualizado: <!-- PERT_DATA: [...] -->
- Si se modifica un árbol de decisión, incluye al final el bloque actualizado: <!-- TREE_DATA: {...} -->`;
  }

  chatHistory.push({ role: "user", parts: [{ text: userPrompt }] });

  // Show loading
  btnSolve.disabled = true;
  loadingBox.classList.add("active");
  resultContainer.style.display = "none";

  try {
    let apiResult = null;
    const selectedEngine = engineSelect ? engineSelect.value : "antigravity";

    // If Antigravity Engine is selected and the bridge is running, solve via bridge
    if (selectedEngine === "antigravity" && isBridgeOnline) {
      const baseUrl = getEffectiveBridgeUrl();
      try {
        const bridgeRes = await fetch(`${baseUrl}/api/solve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: query,
            type: exerciseType.value,
            engine: "antigravity",
            apiKey: apiKey
          })
        });
        const bridgeData = await bridgeRes.json();
        if (bridgeData && bridgeData.solution) {
          apiResult = { text: bridgeData.solution, model: "antigravity-python" };
        }
      } catch (be) {
        console.warn("Bridge solve fallback to direct Gemini:", be);
      }
    }

    if (!apiResult) {
      apiResult = await callGeminiAPI(chatHistory, apiKey);
    }

    const responseText = typeof apiResult === "object" ? apiResult.text : apiResult;
    const modelUsed = (typeof apiResult === "object" && apiResult.model) ? apiResult.model : "gemini-3.8-flash";

    chatHistory.push({ role: "model", parts: [{ text: responseText }] });

    // Sync with remote mobile clients via bridge SSE
    if (isBridgeOnline) {
      const baseUrl = getEffectiveBridgeUrl();
      fetch(`${baseUrl}/api/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "solution",
          data: { prompt: query, solution: responseText, engine: selectedEngine }
        })
      }).catch(() => {});
    }

    // Switch UI to multi-turn mode
    btnSolve.textContent = "Preguntar / Ajustar";
    promptInput.value = "";
    promptInput.placeholder = "Haz una pregunta de seguimiento, pide un ajuste o toca 'Limpiar' para un nuevo ejercicio...";

    // Check if response contains Decision Tree or PERT data to generate native Vector Drawing
    let turnDiagramOoxml = null;
    let diagramType = null;

    // 1. Try Decision Tree
    const treeData = parseTreeData(responseText);
    if (treeData && treeData.nodes && treeData.nodes.length >= 2) {
      try {
        turnDiagramOoxml = buildDecisionTreeOoxml(treeData);
        diagramType = "Árbol de Decisión";
      } catch (e) {
        console.warn("Error building Decision Tree OOXML:", e);
      }
    }

    // 2. Try PERT if not a tree
    if (!turnDiagramOoxml) {
      const pertActivities = parsePertTable(responseText);
      if (pertActivities && pertActivities.length >= 2) {
        try {
          turnDiagramOoxml = buildFullPertOoxmlFromActivities(pertActivities);
          diagramType = "Red PERT";
        } catch (e) {
          console.warn("Error building full PERT OOXML:", e);
        }
      }
    }

    // Convert markdown to clean HTML with native Word elements
    let renderedHtml = "";
    if (typeof marked !== "undefined" && marked.parse) {
      renderedHtml = prepareWordHtml(marked.parse(responseText));
    } else {
      renderedHtml = prepareWordHtml(responseText);
    }

    // Record turn with model metadata
    const newTurn = {
      index: chatTurns.length,
      query: query,
      responseMarkdown: responseText,
      renderedHtml: renderedHtml,
      diagramOoxml: turnDiagramOoxml,
      diagramType: diagramType,
      pertOoxml: turnDiagramOoxml,
      modelUsed: modelUsed,
    };
    chatTurns.push(newTurn);

    // Show latest turn (automatically updates pinned previous header!)
    showTurn(chatTurns.length - 1);
  } catch (err) {
    chatHistory.pop(); // Revert user message on error so history stays valid
    alert("Error al resolver: " + err.message);
  } finally {
    btnSolve.disabled = false;
    loadingBox.classList.remove("active");
  }
});

// Specialized prompt builder for Investigación Operativa (Reglas de Cátedra de Fede)
function buildOperationalResearchPrompt(consigna, selectedType) {
  const text = consigna.toLowerCase();
  let resolvedType = selectedType;

  // Auto-detection logic if type is 'auto' or unselected
  if (!resolvedType || resolvedType === "auto") {
    // 1. Asignación / Húngaro
    if (/\b(h[uú]ngaro)\b/i.test(text) || (/\basignaci[oó]n\b/i.test(text) && !text.includes('asientos')) || (text.includes('asignar') && (text.includes('operarios') || text.includes('máquinas') || text.includes('maquinas') || text.includes('tareas')))) {
      resolvedType = "hungaro";
    // 2. Transporte y Distribución
    } else if (/\b(transporte|esquina noroeste|costos m[ií]nimos?|vogel|vam|modi)\b/i.test(text) || 
               (text.includes('orígenes') && text.includes('destinos') && (text.includes('oferta') || text.includes('demanda')))) {
      resolvedType = "transporte";
    // 3. Teoría de Decisión (Incertidumbre / Matrices de Pago)
    } else if (/\b(wald|maximin|maximax|laplace|hurwicz|savage|arrepentimiento|matriz de pagos|matriz de decisi[oó]n|veip)\b/i.test(text)) {
      resolvedType = "decision";
    // 4. Cadenas de Markov
    } else if (/\b(markov|transici[oó]n|estado estacionario)\b/i.test(text)) {
      resolvedType = "markov";
    // 5. Árboles de Decisión (Secuenciales / Incertidumbre con opciones de mercado o gerenciales)
    } else if (/\b([aá]rbol|rollback|nodo de decisi[oó]n|nodo de azar)\b/i.test(text) || 
               ((text.includes('decisión') || text.includes('decision') || text.includes('alternativa') || text.includes('gerente')) &&
                (text.includes('estudio de mercado') || text.includes('pruebas de mercado') || text.includes('favorable') || text.includes('desfavorable') || text.includes('éxito') || text.includes('exito') || text.includes('aceptación') || text.includes('aceptacion')))) {
      resolvedType = "arbol";
    // 6. PERT / CPM (Redes de proyectos) - Delimitación estricta de palabras (evita falsos positivos como 'reduce' o 'alrededor')
    } else if (/\b(pert|cpm|redes)\b/i.test(text) || text.includes('diagrama de red') || text.includes('red de actividades') || text.includes('camino crítico') || text.includes('camino critico') || text.includes('predecesora') || (text.includes('holgura') && text.includes('actividad'))) {
      resolvedType = "pert";
    // 7. Simplex / Programación Lineal
    } else if (/\b(simplex|programaci[oó]n lineal)\b/i.test(text) || ((text.includes('maximizar') || text.includes('minimizar')) && (text.includes('restricci') || text.includes('holgura')))) {
      resolvedType = "simplex";
    } else {
      resolvedType = "teoria";
    }
  }

  let typeInstruction = "";

  if (resolvedType === "simplex") {
    typeInstruction = `
TIPO DE PROBLEMA: PROGRAMACIÓN LINEAL / MÉTODO SIMPLEX (REGLAS ESTRICTAS DE CÁTEDRA DE FEDE).

DIRECTIVAS METODOLÓGICAS OBLIGATORIAS:
1. RESTRICCIÓN EXPRESA DE CÁTEDRA (PROHIBICIÓN ABSOLUTA):
   - TERMINANTEMENTE PROHIBIDO usar o mencionar Variables Artificiales, Método Gran M (M) o Método de las Dos Fases.
   - En restricciones con '>=', NUNCA inventes variables artificiales ni penalizaciones con M.
2. CONVENCIÓN CANÓNICA Y TRANSFORMACIÓN DE COTAS INFERIORES (MÉTODO OFICIAL DE FEDE):
   - COTAS INFERIORES SIMPLES (TÉCNICA DE FEDE PARA DISPONER DE BASE INICIAL VÁLIDA):
     Si el problema contiene una restricción de cota mínima EXPLÍCITA en el enunciado para una sola variable del tipo X_j >= k (ejemplo: 'ofrecer al menos 10 asientos para no fumadores' -> y >= 10):
     * APLICAR OBLIGATORIAMENTE la sustitución de cota inferior de Fede: escribir X_j = k + t_j (con t_j >= 0, donde k son las unidades mínimas obligatorias y t_j representa las unidades adicionales).
     * ATENCIÓN: NUNCA deduzcas ni inventes cotas inferiores compuestas o artificiales (ej: deducir erróneamente x >= 31 combinando x > y y x + y >= 61). Si no está escrita textualmente como cota mínima directa de una sola variable, NO inventes sustituciones.
     * Sustituir en las restricciones: las desigualdades se transforman en '<=' con lados derechos reducidos pero estrictamente positivos (ej: x + (10 + t) <= 90  =>  x + t <= 80; 2x + 5(10 + t) <= 300  =>  2x + 5t <= 250).
     * Sustituir en la función objetivo: Z = 10x + 6(10 + t) = 10x + 6t + 60. Maximizar W = 10x + 6t y al final recuperar Z = W + 60 (expresado en miles de pesos o pesos directos).
     * Esta sustitución evita completamente variables artificiales y garantiza que el modelo transformado sea DIRECTAMENTE FACTIBLE PRIMAL, resolviéndose en 1 sola iteración de Simplex Primal puro sin necesidad de Simplex Dual.
   - PROBLEMAS DE MINIMIZACIÓN O RESTRICCIONES '>=' GENERALES (SIMPLEX DUAL):
     * Para problemas de MINIMIZACIÓN (ej: minimizar consumo Z = c1*x + c2*y): convertir a maximización Maximizar W' = -Z (ej: W' = -9x - 7y  =>  W' + 9x + 7y = 0).
     * Multiplicar las restricciones '>=' por -1 para convertirlas en '<=' con términos independientes negativos (ej: x - y >= 1  =>  -x + y <= -1  =>  -x + y + S1 = -1; x + y >= 61  =>  -x - y <= -61  =>  -x - y + S3 = -61).
     * Resolver directamente con SIMPLEX DUAL canónico sin inventar sustituciones ni variables artificiales.
   - FORMA ESTÁNDAR DE LAS RESTRICCIONES '<=':
     Agregar una variable de holgura (+S_i >= 0): ej. x + t + S1 = 80; 2x + 5t + S2 = 250.
   - FUNCIÓN OBJETIVO:
     Forma canónica de fila: W - 10x - 6t = 0 (o W' + 9x + 7y = 0, o Z - c^T X = 0).
3. SELECCIÓN RIGUROSA DEL ALGORITMO (PRIMAL O DUAL):
   - Si la transformación de cota inferior dejó todos los lados derechos >= 0: APLICAR DIRECTAMENTE SIMPLEX PRIMAL.
     * Columna Entrante (Columna Pivote): Variable con el coeficiente más negativo en la fila objetivo (W o Z).
     * Fila Saliente (Fila Pivote): Menor cociente no negativo (Solución / a_ik con a_ik > 0).
   - Si por restricciones '>=' complejas existe alguna Solución < 0: APLICAR SIMPLEX DUAL.
     * Fila Saliente: La fila con la Solución más negativa.
     * Columna Entrante: Entre columnas con a_rj < 0, calcular q_j = C_j / (-a_rj) y elegir el menor cociente no negativo.
4. OPERACIONES VECTORIALES DE GAUSS-JORDAN OBLIGATORIAS:
   Para cada fila nueva de la siguiente tabla, mostrar explícitamente el desarrollo vectorial completo:
   F'_r = F_r / p
   F'_i = F_i - a_ik * F'_r
   (Mostrar los vectores anteriores, la operación numérica de resta/suma y el vector resultante).
5. TABLAS SIMPLEX PASO A PASO (Formato de tabla Markdown con bordes):
   - Columnas: | Base | x | t | S1 | S2 ... | Solución | Cociente |
   - Fila objetivo (W o Z) integrada canónicamente en la tabla.
   - REGLA DE COCIENTES: La columna "Cociente" SOLO se calcula en iteraciones donde se va a pivotear. EN LA TABLA FINAL ÓPTIMA ESTÁ PROHIBIDO CALCULAR COCIENTES (dejar guiones o vacía).
6. SOLUCIÓN ÓPTIMA E INTERPRETACIÓN ECONÓMICA:
   - Recuperación de variables originales si se usó sustitución: ej. t = 0  =>  y = 10 + 0 = 10 asientos no fumadores; x = 80 asientos fumadores.
   - Recuperación del beneficio real: ej. Z = W + 60 = 800 + 60 = 860 (miles de pesos) = 860.000 pesos.
   - Verificación estricta en las restricciones originales (capacidad de asientos, capacidad de equipaje en kg, cumplimiento de política) y análisis de holguras con unidades físicas.`;
  } else if (resolvedType === "pert") {
    typeInstruction = `
TIPO DE PROBLEMA: DIAGRAMA DE REDES / PERT - CPM.

REGLAS DE IDENTIFICACIÓN Y EXTRACCIÓN UNIVERSAL (Cualquier formato de consigna):
- La consigna puede venir redactada como tabla formal, lista de viñetas, párrafo narrativo de texto continuo o copiada de un PDF/Word.
- Identifica cada tarea y asígnale un identificador corto (A, B, C... o T1, T2...) si el enunciado solo describe nombres largos (ej: "Estudio de mercado" -> "A").
- Si el ejercicio es PERT probabilístico con 3 estimaciones de tiempo (optimista 'a', más probable 'm', pesimista 'b'), calcula el tiempo esperado: te = (a + 4m + b) / 6 y úsalo como la duración 't'.
- Reconoce las predecesoras bajo cualquier denominación ("Predecesora", "Inmediata", "Depende de", "Requisitos", "Secuencia previa", guiones "-" o "Ninguna").

DEBES RESOLVER EL PROBLEMA SIGUIENDO ESTRICTAMENTE ESTE ORDEN DE RAZONAMIENTO MATEMÁTICO:

1. PASO HACIA ADELANTE (FORWARD PASS) - TIEMPOS TEMPRANOS:
Calcula para cada actividad su Inicio Temprano (ES) y Fin Temprano (EF = ES + t):
- Para actividades iniciales (sin predecesores): ES = 0.
- Para actividades con predecesoras: ES = max(EF de todas sus predecesoras directas).
Muestra explícitamente cada ecuación y resultado aritmético paso a paso (ej: "ES(C) = EF(A) = 6 ➔ EF(C) = 6 + 2 = 8 meses").

2. TIEMPO MÍNIMO DEL PROYECTO (T*):
Identifica todas las actividades terminales (aquellas que NO tienen sucesoras directas).
Calcula formalmente el tiempo total del proyecto: T* = max(EF de todas las terminales). Muestra la comparación.

3. PASO HACIA ATRÁS (BACKWARD PASS) - TIEMPOS TARDÍOS:
(REGLA UNIVERSAL ESTRICTA: Para TODAS las actividades terminales, su Fin Tardío es IGUAL a T*: LF = T*. Ninguna terminal puede tener LF distinto a T*).
Calcula para cada actividad su Fin Tardío (LF) e Inicio Tardío (LS = LF - t):
- Para actividades con sucesoras: LF = min(LS de todas sus sucesoras directas).
Muestra explícitamente cada cálculo hacia atrás.

4. CÁLCULO DE HOLGURAS TOTALES Y DETERMINACIÓN DEL CAMINO CRÍTICO:
- Calcula para cada actividad la Holgura Total: h = LS - ES = LF - EF.
- Identifica las actividades críticas con holgura nula (h = 0).
- Define la secuencia exacta del Camino Crítico principal.

5. ANÁLISIS COMPARATIVO DE RUTAS DE LA RED (TABLA DE WORD):
Genera obligatoriamente una tabla formal de Word con la comparación de todas las rutas posibles desde INICIO hasta FIN:
| Ruta | Secuencia de la Ruta | Operación de Duración | Duración Total | ¿Es Ruta Crítica? |
| :---: | :--- | :---: | :---: | :---: |
(Enumera cada ruta y resalta en negrita la ruta con mayor duración: T*).

6. TABLA MAESTRA DE ACTIVIDADES Y HOLGURAS (TABLA CUADRADA DE 9 COLUMNAS):
Vuelca los resultados matemáticos calculados anteriormente en la tabla final con bordes:
| Actividad | Predecesora | Duración (t) | Inicio Temprano (ES) | Fin Temprano (EF) | Inicio Tardío (LS) | Fin Tardío (LF) | Holgura Total (H = LF - EF) | ¿Crítica? |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |

7. ESTRUCTURA JSON OCULTA (OBLIGATORIA AL FINAL DEL TEXTO):
Al final de todo el texto, incluye un bloque HTML oculto con el resumen JSON de las actividades para alimentar el generador vectorial del dibujo:
<!-- PERT_DATA:
[
  {"id": "A", "act": "A", "t": 6, "pred": [], "es": 0, "ef": 6, "ls": 0, "lf": 6, "h": 0, "crit": true},
  ...
]
-->`;
  } else if (resolvedType === "transporte") {
    typeInstruction = `
TIPO DE PROBLEMA: MODELO DE TRANSPORTE Y DISTRIBUCIÓN (REGLAS DE CÁTEDRA).

ESTRUCTURA OBLIGATORIA DEL DESARROLLO (Paso a Paso):
1. ANÁLISIS DE BALANCEO:
   - Suma total de Ofertas vs Suma total de Demandas.
   - Si no son iguales, balancear obligatoriamente agregando un Origen Ficticio o Destino Ficticio por la diferencia con costo cero (o penalización si el enunciado lo indica).
   - Explicar qué representa la fila/columna ficticia (capacidad ociosa o demanda insatisfecha).
2. MATRIZ DE COSTOS UNITARIOS INICIAL:
   - Tabla Markdown formal con orígenes en filas, destinos en columnas, costos unitarios, ofertas y demandas.
3. SOLUCIÓN BÁSICA INICIAL (MÉTODO SOLICITADO: COSTOS MÍNIMOS, NOROESTE O VOGEL / VAM):
   - Desarrollar la asignación paso a paso: Celda seleccionada, cantidad asignada min(Oferta remanente, Demanda remanente), sector cancelado (fila o columna satisfecha) y saldos restantes.
   - Si se usa Vogel (VAM): mostrar el cálculo explícito de penalizaciones (diferencia entre los dos costos menores) para cada fila y columna activa en cada paso.
4. CONDICIÓN DE BASE Y DEGENERACIÓN:
   - Verificar la cantidad de celdas básicas: m + n - 1 (m orígenes, n destinos).
   - Si hay menos de m + n - 1 celdas asignadas, incorporar ceros básicos denotados como 0* en celdas independientes que no formen circuito.
5. COSTO TOTAL DE LA SOLUCIÓN INICIAL:
   - C0 = sum(Costo_ij * Cantidad_ij) con el resultado numérico explícito.
6. OPTIMIZACIÓN MODI (MÉTODO DE DISTRIBUCIÓN MODIFICADA) Y PRUEBA DE OPTIMALIDAD:
   - Fijar u_1 = 0.
   - Resolver sistema u_i + v_j = c_ij para todas las celdas básicas (incluidos los 0*).
   - Calcular índices de mejora para las celdas no básicas: I_ij = c_ij - u_i - v_j.
   - Mostrar la tabla de potenciales (u_i, v_j) e índices I_ij.
   - Si todos los I_ij >= 0: declarar formalmente la solución óptima.
   - Si existen I_ij < 0: seleccionar el más negativo, construir el circuito cerrado de saltos ortogonales (+ / -), determinar theta = min(posiciones -), mostrar la tabla explicativa "Antes / Cambio / Después" y calcular el nuevo costo.
7. MATRIZ DE DISTRIBUCIÓN FINAL Y CONCLUSIÓN:
   - Tabla Markdown completa con las asignaciones finales y costo óptimo Z*.`;
  } else if (resolvedType === "hungaro") {
    typeInstruction = `
TIPO DE PROBLEMA: ASIGNACIÓN / MÉTODO HÚNGARO (REGLAS DE CÁTEDRA).

ESTRUCTURA OBLIGATORIA DEL DESARROLLO (Paso a Paso):
1. PREPARACIÓN Y BALANCEO DE LA MATRIZ:
   - Conservar intacta la Matriz Original de costos/beneficios para calcular el resultado final.
   - Verificar si la matriz es cuadrada (n x n). Si no lo es, balancear agregando filas o columnas ficticias con costo cero.
   - Si el problema es de MAXIMIZACIÓN: convertir a minimización mediante c'_ij = M - b_ij (donde M = max(b_ij)).
2. PASO 1 - REDUCCIÓN POR FILAS:
   - Identificar el valor mínimo de cada fila y restarlo a todos los elementos de la fila.
   - Mostrar la matriz resultante con los ceros generados.
3. PASO 2 - REDUCCIÓN POR COLUMNAS:
   - Sobre la matriz reducida por filas, identificar el valor mínimo de cada columna y restarlo a su columna.
   - Mostrar la nueva matriz reducida.
4. PASO 3 - COBERTURA MÍNIMA DE CEROS (REGLA ESTRICTA DE CÁTEDRA):
   - Trazar la cantidad mínima de líneas rectas (horizontales y verticales) necesarias para cubrir ABSOLUTAMENTE TODOS los ceros de la matriz reducida: L.
   - Comprobación estricta: Comprueba que ninguna celda con valor 0 quede al descubierto. Si existen n ceros independientes (que no comparten fila ni columna), la cobertura mínima es obligatoriamente L = n.
   - REGLA DE NO INVENTAR AJUSTES: Si L = n, la solución óptima está alcanzada directamente en la matriz reducida. TERMINANTEMENTE PROHIBIDO inventar pasos de ajuste si L = n (pasar directamente al Paso de Asignación).
   - Solo si L < n: Proseguir al Paso 4 de ajuste con h.
5. PASO 4 - AJUSTE CON MENOR ELEMENTO NO CUBIERTO (h) [Solo si L < n]:
   - Determinar h = menor valor entre las celdas NO cubiertas por ninguna línea.
   - Restar h a todas las celdas descubiertas.
   - Sumar h a las intersecciones de dos líneas (cruce de línea horizontal y vertical).
   - Dejar sin cambios las celdas cubiertas por una sola línea.
   - Mostrar la nueva matriz ajustada y verificar nuevamente la cobertura.
6. PASO 5 - ASIGNACIÓN DE CEROS INDEPENDIENTES:
   - Seleccionar sistemáticamente ceros independientes: iniciar por filas o columnas con un ÚNICO cero no asignado, seleccionarlo y tachar los ceros restantes de su fila y columna.
   - Completar exactamente una asignación por fila y por columna.
7. RESULTADO FINAL Y COSTO UNITARIO TOTAL (EVALUADO EN LA MATRIZ ORIGINAL):
   - Detallar la pareja de asignación formal: Recurso_i -> Tarea_j.
   - OBLIGATORIO: Tomar los costos/beneficios de la MATRIZ ORIGINAL (NUNCA sumar los ceros de la matriz reducida).
   - Sumatoria formal y costo total unitario óptimo Z*.
8. INCISOS DE DISTRIBUCIÓN REAL DE CANTIDADES (SI EL ENUNCIADO INCLUYE LITROS / VOLÚMENES / OFERTAS Y DEMANDAS):
   - ACLARACIÓN DE CÁTEDRA (SECCIÓN 10.1): Explicar claramente que el costo unitario del Húngaro (Z* = 8) es solo para asignación biunívoca 1 a 1 y no satisface la demanda total de litros (ej: D2 solo tiene 120 L y A necesita 125 L, D3 tiene 80 L y C necesita 130 L).
   - MODELO FORMAL DE TRANSPORTE: Para resolver la distribución física solicitada ("Tabla de costos asociados a la distribución" y "Gráfico de distribución"), formular el modelo de Transporte balanceado (395 L = 395 L) con x_ij = litros enviados del depósito i al producto j.
   - SOLUCIÓN INICIAL POR MÉTODO DE COSTOS MÍNIMOS (Paso a Paso):
     * Seleccionar en cada iteración la celda activa de menor costo unitario y asignar min(oferta restante, demanda restante).
     * Mostrar explícitamente las 7 asignaciones básicas sucesivas (m + n - 1 = 4 + 4 - 1 = 7 celdas básicas):
       1. D2 -> A: 120 L (costo 1)
       2. D3 -> C: 80 L (costo 1)
       3. D1 -> A: 5 L (costo 2)
       4. D1 -> B: 50 L (costo 3)
       5. D4 -> D: 90 L (costo 3)
       6. D1 -> C: 45 L (costo 4)
       7. D4 -> C: 5 L (costo 6)
   - MATRIZ FINAL DE DISTRIBUCIÓN: Tabla Markdown formal con las 7 asignaciones, ofertas utilizadas (100, 120, 80, 95) y demandas cubiertas (125, 50, 130, 90).
   - TABLA DE COSTOS ASOCIADOS A LA DISTRIBUCIÓN: Mostrar la tabla con el producto enviado por depósito, cálculo de costo parcial por celda y costo total por depósito (D1 = 340, D2 = 120, D3 = 80, D4 = 300 ➔ Costo Total Mínimo = 840 unidades de costo).
   - PRUEBA DE OPTIMALIDAD (POTENCIALES MODI):
     * Fijar u1 = 0 y resolver u_i + v_j = c_ij en las 7 celdas básicas obteniendo los vectores u = (0, -1, -3, 2) y v = (2, 3, 4, 1).
     * Calcular los índices marginales de mejora I_ij = c_ij - u_i - v_j para todas las celdas no básicas.
     * Demostrar que todos los I_ij >= 0, confirmando que la distribución con Costo Total = 840 es matemáticamente ÓPTIMA.
9. GRÁFICO DE DISTRIBUCIÓN:
   - Presentar el grafo bipartito visual con las 7 rutas de envío reales, indicando cantidades en litros y costos unitarios de cada conexión.`;
  } else if (resolvedType === "decision") {
    typeInstruction = `
TIPO DE PROBLEMA: TEORÍA DE LA DECISIÓN / MATRICES DE PAGOS (REGLAS DE CÁTEDRA).

ESTRUCTURA OBLIGATORIA DEL DESARROLLO (Paso a Paso):
1. IDENTIFICACIÓN Y MATRIZ DE DECISIÓN:
   - Aclarar explícitamente si los valores representan BENEFICIOS (a maximizar) o COSTOS (a minimizar).
   - Matriz de pagos formal en Markdown: Filas = Alternativas de decisión; Columnas = Estados de la Naturaleza (con sus probabilidades asociadas si se conocen).
2. TOMA DE DECISIONES BAJO INCERTIDUMBRE (Si no hay probabilidades dadas):
   Desarrollar y comparar los criterios solicitados:
   - Criterio de Wald (Maximin / Pesimista): Listar el peor resultado de cada alternativa (mínimo beneficio o máximo costo) y elegir el mejor de ellos.
   - Criterio Maximax (Optimista): Listar el mejor resultado de cada alternativa y elegir el máximo.
   - Criterio de Laplace (Razón Insuficiente): Asignar probabilidades iguales 1/n a cada estado y calcular el promedio simple por alternativa.
   - Criterio de Hurwicz: Con coeficiente de optimismo alpha dado (o default 0.5): H = alpha * Mejor + (1 - alpha) * Peor.
   - Criterio de Savage (Minimax de Arrepentimiento / Pesar):
     * OBLIGATORIO: Construir y mostrar la MATRIZ DE ARREPENTIMIENTO completa r_ij = (Mejor valor del estado j) - a_ij (en beneficios).
     * Identificar el máximo arrepentimiento por fila.
     * Seleccionar la alternativa con el MENOR de los máximos arrepentimientos.
3. TOMA DE DECISIONES BAJO RIESGO (Si hay probabilidades conocidas):
   - Cálculo del Valor Monetario Esperado (VME / EMV) para cada alternativa: VME_i = sum(P_j * Pago_ij).
   - Determinación de la alternativa óptima que maximiza el beneficio esperado (o minimiza el costo esperado).
   - Valor Esperado con Información Perfecta (VEIP):
     * VE con IP = sum(P_j * Mejor resultado en estado j).
     * VEIP = |VE con IP - VME óptimo|.
4. RESUMEN Y RECOMENDACIÓN FINAL:
   - Tabla comparativa de los criterios y decisión recomendada con unidades monetarias.`;
  } else if (resolvedType === "arbol") {
    typeInstruction = `
TIPO DE PROBLEMA: ÁRBOLES DE DECISIÓN (REGLAS DE CÁTEDRA).

ORDEN DE PRESENTACIÓN ESTRICTO (REGLA DE ORO DE CÁTEDRA):
PRIMERO PRESENTAR EL ESQUEMA COMPLETO DEL ÁRBOL. DESPUÉS DESARROLLAR LOS CÁLCULOS DE VME.

ESTRUCTURA OBLIGATORIA DEL DESARROLLO:
1. IDENTIFICACIÓN DE COMPONENTES Y REGLAS DE MODELADO:
   - Nodos de decisión (cuadrados): alternativas controlables del decisor. Si una opción directa no tiene azar ni etapas posteriores (ej: Vender a gran compañía), conecta directamente al pago terminal neto.
   - Nodos de azar (círculos): eventos probabilísticos (las probabilidades de las ramas que salen de cada círculo deben sumar 1 exactamente).
   - Interpretación de probabilidades: Expresiones en lenguaje natural como 'una entre cuatro' (1/4 = 0.25), 'uno de cada cinco' (1/5 = 0.20), 'tres cuartos' (0.75), etc., deben mapearse estrictamente como probabilidades de los eventos de la rama correspondiente (ej: Éxito = 0.25, Fracaso = 0.75). No reemplaces ni confundas estas probabilidades con otros porcentajes del enunciado.
   - Orden temporal en comercialización: Si tras un estudio favorable se decide comercializar (incurriendo en el gasto de comercialización), la aceptación del cliente es un azar posterior. Si los clientes NO aceptan el producto, el gasto de comercialización YA FUE INCURRIDO. Por tanto, el pago terminal de mala aceptación es: 0 - costo_estudio - costo_comercialización (ej: 0 - 8 - 5 = -13 M).
   - Campaña anticipada directa (sin nodos previos de estudio): Si se adelanta la campaña comprometiendo pruebas y comercialización por adelantado (costo total = estudio + comercialización = 13 M), la alternativa se bifurca DIRECTAMENTE en Éxito (0.25) y Fracaso (0.75). En caso de fracaso se evalúan las aplicaciones alternativas (0.20 y 0.80). NO intercales un nivel previo de pruebas favorables/desfavorables en la campaña anticipada; la campaña evalúa directamente Éxito vs Fracaso.
   - Prohibición de nodos ficticios: Si una alternativa exige incurrir en costos tanto si tiene éxito como si no (costos fijos irrecuperables), esos costos se descuentan de todos sus pagos terminales. NUNCA inventes nodos de decisión artificiales de 'abandonar' o 'continuar'.
   - Pagos netos terminales: Ingresos acumulados del camino menos los costos totales que ocurren en ese camino exacto.
   - PROHIBIDO DESCONTAR DOS VECES UN MISMO COSTO (REGLA DE CÁTEDRA): Si los pagos terminales ya son netos (ingresos menos costos de ese camino), el Rollback produce directamente el VME neto en cada nodo. ¡TERMINANTEMENTE PROHIBIDO volver a restar el costo del estudio (-8 M) en el nodo raíz! En la rama de Estudio de Mercado, el VME es 5.0 M (NUNCA restes 8 M otra vez para que dé -3.0 M).
   - Aritmética rigurosa: Verifica cada operación de Rollback con exactitud matemática (sin aproximaciones erróneas).
2. ESQUEMA JERÁRQUICO COMPLETO DEL ÁRBOL DE DECISIÓN:
   - Representar la estructura cronológica de izquierda a derecha con sangrías y ramas legibles en formato texto / árbol con conectores (ej: D1 ├── Vender directo ──> +100 M).
   - Mostrar cada rama con su nombre, costo asociado, probabilidad condicional y pago terminal neto sin dejar campos vacíos.
3. RESOLUCIÓN HACIA ATRÁS (ROLLBACK DE DERECHA A IZQUIERDA):
   - Comenzar por los nodos más cercanos a los pagos terminales.
   - Nodos de azar (círculos): Calcular el promedio ponderado VME = sum(Probabilidad * Valor siguiente).
   - Nodos de decisión (cuadrados): Comparar las alternativas y seleccionar la de mayor VME (para beneficios) podando las ramas descartadas.
   - Mostrar las sustituciones numéricas paso a paso avanzando hacia la raíz del árbol.
4. POLÍTICA DE DECISIÓN ÓPTIMA Y CONCLUSIÓN:
   - Indicar explícitamente la estrategia secuencial recomendada (qué hacer inicialmente y qué decisión tomar ante cada resultado posterior observado).
   - Valor Monetario Esperado óptimo final con unidades.

5. ESTRUCTURA JSON OCULTA DEL ÁRBOL (OBLIGATORIA, PUEDE IR TRAS LA SECCIÓN 2 O AL FINAL):
Incluye un bloque HTML oculto con la estructura JSON completa del árbol para alimentar el generador vectorial nativo de Word:
<!-- TREE_DATA:
{
  "nodes": [
    {"id": "D1", "type": "decision", "label": "Decidir", "vme": "100 M"},
    {"id": "A1", "type": "chance", "label": "Estudio", "vme": "5 M"},
    {"id": "T1", "type": "terminal", "label": "Venta", "payoff": "100 M"}
  ],
  "edges": [
    {"from": "D1", "to": "T1", "label": "Vender directo", "prob": "", "cost": "0", "optimal": true},
    {"from": "D1", "to": "A1", "label": "Estudiar mercado", "prob": "", "cost": "-8 M", "optimal": false}
  ]
}
-->
REGLAS PARA TREE_DATA:
- "nodes": lista con TODOS los nodos. "type" debe ser exactamente "decision" (cuadrado), "chance" (círculo) o "terminal" (triángulo).
- "id": identificadores cortos y limpios ("D1", "D2", "C1", "C2", "T1", "T2"...).
- "label": texto corto para mostrar dentro del nodo (ej: "D1", "C1", "T1").
- "vme": valor monetario esperado del nodo según el rollback (ej: "100 M", "5 M", "39 M").
- "payoff": valor neto en los nodos terminales (ej: "100 M", "+27 M", "-13 M", "+147 M").
- "edges": lista con TODAS las ramas. "optimal" es true para las ramas de la política óptima recomendada.
- ESTRUCTURA DE COMERCIALIZACIÓN EN ÁRBOLES DE DECISIÓN:
  Tras un estudio favorable, la decisión 'Comercializar' conduce a un NODO DE AZAR (Aceptación del mercado). De ese nodo de azar se desprenden OBLIGATORIAMENTE dos ramas terminales hermanas:
  1. 'Buena aceptación' (p = 0.60) -> Terminal T_buena (+27 M)
  2. 'Mala aceptación' (p = 0.40) -> Terminal T_mala (-13 M)
  TERMINANTEMENTE PROHIBIDO conectar 'Comercializar' directamente a un terminal o conectar 'Mala aceptación' saliendo de 'Buena aceptación'.
- PROHIBICIÓN DE SALIDAS EN NODOS TERMINALES:
  Los nodos de tipo "terminal" NUNCA deben aparecer en el campo "from" de ninguna arista de "edges".
- También se acepta formato jerárquico {"name": "...", "type": "decision", "children": [...]}.`;
  } else if (resolvedType === "markov") {
    typeInstruction = `
TIPO DE PROBLEMA: CADENAS DE MARKOV Y PROCESOS DE TRANSICIÓN (REGLAS DE CÁTEDRA).

ESTRUCTURA OBLIGATORIA DEL DESARROLLO (Paso a Paso):
1. DEFINICIÓN DE ESTADOS Y PERÍODO:
   - Identificación de los estados del sistema (E1, E2, ...).
   - Período de tiempo de cada paso de transición.
2. MATRIZ DE PROBABILIDADES DE TRANSICIÓN (P):
   - Tabla Markdown de la matriz estocástica P (filas suman exactamente 1).
   - Definición del vector de probabilidades inicial v(0).
3. EVOLUCIÓN TEMPORAL PASO A PASO:
   - Cálculo del período 1: v(1) = v(0) * P (mostrar el producto vector-matriz paso a paso).
   - Cálculo de períodos sucesivos si se solicitan: v(t) = v(t-1) * P.
   - Si se piden cantidades esperadas: multiplicar las probabilidades por el tamaño total de la población.
4. ESTADO ESTACIONARIO / DISTRIBUCIÓN DE LARGO PLAZO:
   - Planteo formal del sistema de ecuaciones: pi = pi * P junto con la restricción normalizadora sum(pi_i) = 1.
   - Resolución algebraica paso a paso del sistema lineal.
   - Vector de probabilidades estacionarias resultante y su interpretación física/comercial en porcentaje.`;
  } else {
    typeInstruction = `
TIPO DE PROBLEMA: EXAMEN DE INGENIERÍA / INVESTIGACIÓN OPERATIVA.
Desarrolla la respuesta con el máximo rigor académico, pasos matemáticos detallados, justificación técnica formal y tablas completas según las normas de cátedra.`;
  }

  return `OBJETIVO: Eres un profesor titular y experto en INVESTIGACIÓN OPERATIVA de Ingeniería en Sistemas.
Tu tarea es resolver la siguiente consigna de examen generando EXCLUSIVAMENTE EL DESARROLLO COMPLETO Y PASO A PASO con todas las tablas matemáticas.

${typeInstruction}

REGLAS DE FORMATO ESTRICTAS:
1. SOLO EL DESARROLLO CON LOS PASOS: No incluyas saludos, ni charlas, ni introducciones vacías como "A continuación resuelvo...". Ve directo al paso 1.
2. FORMATO NATIVO PARA MICROSOFT WORD (CERO CÓDIGO Y CERO LATEX):
   - ESTRICTAMENTE PROHIBIDO usar bloques de código (\`\`\`), líneas de consola o signos igual (===).
   - ESTRICTAMENTE PROHIBIDO usar sintaxis LaTeX cruda (\\implies, \\max, \\text, signos de dólar $). Escribe texto claro y legible: "ES = 3  →  EF = 4 meses".
   - TODAS LAS TABLAS EN FORMATO TABLA MARKDOWN: Usa tablas Markdown prolijas (con | y -) para que Word las convierta automáticamente en tablas reales editables con cuadrícula y bordes.
3. PRECISIÓN MATEMÁTICA ABSOLUTA: Verifica todas las operaciones aritméticas (sumas, multiplicaciones de matrices, holguras, valor esperado).

CONSIGNA DEL EXAMEN:
${consigna}`;
}

// Call Google Gemini API (Single prompt or Multi-turn History)
async function callGeminiAPI(promptOrContents, apiKey) {
  const models = [
    "gemini-3.8-flash",
    "gemini-3.1-pro-preview",
    "gemini-3.5-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-latest"
  ];
  let lastError = null;

  const contentsPayload = Array.isArray(promptOrContents)
    ? promptOrContents
    : [{ parts: [{ text: promptOrContents }] }];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: contentsPayload,
          generationConfig: {
            temperature: 0.0,
            maxOutputTokens: 8192,
          },
        }),
      });

      const data = await response.json();
      if (data.error) {
        lastError = data.error.message;
        continue;
      }

      const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join("\n\n");
      if (text) return { text, model };
    } catch (err) {
      lastError = err.message;
    }
  }

  throw new Error(lastError || "No se pudo obtener respuesta de la IA.");
}
