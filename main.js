const { app, BrowserWindow, ipcMain, globalShortcut, clipboard, dialog, webUtils } = require("electron");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const pdfParse = require("pdf-parse");

// Load .env if present
try {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [k, ...v] = trimmed.split("=");
        if (k && v.length) process.env[k.trim()] = v.join("=").trim();
      }
    }
  }
} catch {}

const DEFAULT_API_KEY = "";

const logFile = path.join(app.getPath("userData"), "debug.log");
const log = (msg) => {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
};

let mainWindow = null;
let isFocusable = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 600,
    center: true,
    frame: true,
    autoHideMenuBar: true,
    alwaysOnTop: true,
    backgroundColor: "#ffffff",
    focusable: false, // Stealth: clicking does not steal focus from browser!
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: true,
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.setAlwaysOnTop(true, "status");

  mainWindow.webContents.on("console-message", (_event, _level, message) => {
    log(`[Renderer] ${message}`);
  });
}

app.whenReady().then(() => {
  log("app.whenReady");
  createWindow();

  // Ctrl+Shift+H: Toggle show/hide
  globalShortcut.register("Ctrl+Shift+H", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  // Ctrl+Shift+A: Ask clipboard directly
  globalShortcut.register("Ctrl+Shift+A", () => {
    if (mainWindow) {
      mainWindow.webContents.send("ask-clipboard");
    }
  });

  // Ctrl+Shift+Space: Toggle typing focus
  globalShortcut.register("Ctrl+Shift+Space", () => {
    if (!mainWindow) return;
    toggleFocusMode();
  });
});

function toggleFocusMode(forceState) {
  isFocusable = forceState !== undefined ? forceState : !isFocusable;
  mainWindow.setFocusable(isFocusable);
  if (isFocusable) {
    mainWindow.focus();
    mainWindow.webContents.send("focus-state-changed", true);
  } else {
    mainWindow.blur();
    mainWindow.webContents.send("focus-state-changed", false);
  }
}

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle("set-focus-mode", (_event, state) => {
  toggleFocusMode(state);
});

ipcMain.handle("set-opacity", (_event, val) => {
  if (mainWindow) mainWindow.setOpacity(Math.max(0.15, Math.min(1.0, val)));
});

ipcMain.handle("set-theme", (_event, theme) => {
  if (mainWindow) {
    mainWindow.setBackgroundColor(theme === "dark" ? "#0f172a" : "#ffffff");
  }
});

// Helper: Parse any document file (PDF, TXT, MD, etc.)
async function parseDocument(filePath, bufferOverride, fileNameOverride) {
  const fileName = fileNameOverride || path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();

  try {
    const buffer = bufferOverride || fs.readFileSync(filePath);
    let text = "";

    if (ext === ".pdf") {
      const parsed = await pdfParse(buffer);
      text = parsed.text || "";
    } else {
      text = buffer.toString("utf8");
    }

    log(`Document parsed successfully: ${fileName} (${text.length} chars)`);
    return {
      name: fileName,
      charCount: text.length,
      content: text,
    };
  } catch (err) {
    log(`Document parsing error: ${err.message}`);
    return { error: err.message };
  }
}

// IPC: Document selection via dialog (supports MULTIPLE files!)
ipcMain.handle("select-document", async () => {
  mainWindow.setFocusable(true);
  
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Seleccionar uno o más documentos",
    filters: [
      { name: "Documentos", extensions: ["pdf", "txt", "md", "csv", "json"] },
      { name: "Todos los archivos", extensions: ["*"] },
    ],
    properties: ["openFile", "multiSelections"],
  });

  mainWindow.setFocusable(isFocusable);

  if (result.canceled || !result.filePaths.length) return null;

  const docs = [];
  for (const fp of result.filePaths) {
    const doc = await parseDocument(fp);
    if (doc && !doc.error) docs.push(doc);
  }
  return docs;
});

// IPC: Load document from path (drag & drop)
ipcMain.handle("load-document-path", async (_event, filePath) => {
  log(`load-document-path: ${filePath}`);
  return await parseDocument(filePath);
});

// IPC: Load document from buffer fallback (drag & drop)
ipcMain.handle("load-document-buffer", async (_event, { name, buffer }) => {
  log(`load-document-buffer: ${name}`);
  const nodeBuf = Buffer.from(buffer);
  return await parseDocument(null, nodeBuf, name);
});

function getCopierPath() {
  const candidates = [
    path.join(process.resourcesPath || "", "app.asar.unpacked", "copier.exe"),
    path.join(process.resourcesPath || "", "copier.exe"),
    path.join(__dirname, "copier.exe"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, "copier.exe");
}

// IPC: Simulate Ctrl+C on active foreground window and get selected text
ipcMain.handle("get-selected-text", async () => {
  const copierPath = getCopierPath();
  clipboard.writeText("");

  return new Promise((resolve) => {
    execFile(copierPath, [], (err) => {
      if (err) log("copier.exe error: " + err.message);
      
      setTimeout(() => {
        const text = clipboard.readText();
        log(`get-selected-text: "${text ? text.substring(0, 40) : ""}" (len=${text ? text.length : 0})`);
        resolve(text || "");
      }, 70);
    });
  });
});

// IPC: Read clipboard
ipcMain.handle("get-clipboard", () => {
  const text = clipboard.readText();
  log(`get-clipboard called: "${text ? text.substring(0, 40) : ""}" (len=${text ? text.length : 0})`);
  return text || "";
});

// Function to clean any leftover formatting symbols
function cleanTextFormatting(str) {
  if (!str) return "";
  return str
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/^[\*\-]\s+/gm, "• ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/```[a-zA-Z]*\n?/g, "")
    .replace(/\*+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// IPC: Clean AI call without hardcoded exam preprompts and with clean plain text formatting
ipcMain.handle("ai-request", async (_event, { message, documents, userApiKey, history, model: userModel }) => {
  const docList = Array.isArray(documents) ? documents.filter(d => d && d.content) : [];
  log(`ai-request: "${message.substring(0, 50)}..." (DocsCount: ${docList.length}, HistoryLen: ${history ? history.length : 0})`);
  
  const apiKey = (userApiKey && userApiKey.trim()) ? userApiKey.trim() : (process.env.GEMINI_API_KEY || DEFAULT_API_KEY);
  if (!apiKey) {
    return { error: "Falta configurar tu API Key. Haz clic en 'API Key' arriba a la derecha para guardarla." };
  }

  // Conversation history
  let historyText = "";
  if (Array.isArray(history) && history.length > 0) {
    historyText = history
      .map((h) => `${h.role === "user" ? "Usuario" : "Asistente"}: ${h.content}`)
      .join("\n\n");
  }

  // Documents
  let docsSection = "";
  if (docList.length > 0) {
    docsSection = docList.map((doc, idx) => {
      return `[DOCUMENTO DE REFERENCIA ${idx + 1}: ${doc.name}]\n${doc.content}\n[FIN DOCUMENTO ${idx + 1}]`;
    }).join("\n\n");
  }

  let promptText = "";
  if (docsSection) {
    promptText = `${docsSection}\n\n${historyText ? `HISTORIAL PREVIO:\n${historyText}\n\n` : ""}CONSULTA:\n${message}`;
  } else if (historyText) {
    promptText = `${historyText}\n\nUsuario: ${message}`;
  } else {
    promptText = message;
  }

  // Sole system instruction: clean plain text, no markdown formatting
  const systemInstruction = 
    "INSTRUCCIÓN OBLIGATORIA DE FORMATO:\n" +
    "Responde siempre en texto plano, limpio y ordenado.\n" +
    "NO utilices ningún símbolo de formato Markdown bajo ninguna circunstancia:\n" +
    "- Está estrictamente prohibido usar asteriscos (* o ** o ***), ya sea para negritas, cursivas o viñetas.\n" +
    "- Está prohibido usar numerales (#, ##, ###) para títulos.\n" +
    "- Está prohibido usar guiones decorativos o líneas separadoras (como --, --- o ___).\n" +
    "- Si necesitas listar o enumerar puntos, hazlo únicamente usando números simples (1., 2., 3.) o saltos de línea ordenados.\n" +
    "- El texto debe ser totalmente claro, legible y sin etiquetas ni símbolos especiales de marcado.";

  const preferredModel = (userModel && userModel.trim()) ? userModel.trim() : (process.env.GEMINI_MODEL || "gemini-3.5-flash");
  const candidates = [
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-latest"
  ];
  const models = [preferredModel, ...candidates.filter((m) => m !== preferredModel)];
  let lastError = null;

  for (const model of models) {
    try {
      log(`Calling model: ${model}`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(20000),
      });

      const data = await res.json();

      if (data.error) {
        log(`Model ${model} returned error: ${data.error.message} (code ${data.error.code})`);
        lastError = data.error.message;
        continue;
      }

      const candidate = data.candidates?.[0];
      if (!candidate) {
        lastError = "Sin candidatos en la respuesta";
        continue;
      }

      const parts = candidate.content?.parts || [];
      const textParts = parts.map((p) => p.text).filter(Boolean);
      let fullText = textParts.join("\n\n").trim();

      if (fullText) {
        fullText = cleanTextFormatting(fullText);
        log(`Model ${model} succeeded! Clean length: ${fullText.length}`);
        return { text: fullText, model };
      } else {
        lastError = "Respuesta vacía del modelo";
      }
    } catch (err) {
      log(`Fetch error with ${model}: ${err.message}`);
      lastError = err.message;
    }
  }

  return { error: lastError || "Error al contactar a la IA" };
});
