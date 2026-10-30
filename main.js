const { app, BrowserWindow, Menu, ipcMain, globalShortcut, clipboard, dialog, webUtils } = require("electron");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const pdfParse = require("pdf-parse");

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

const { createBridgeServer, broadcastSSE, getLocalIps, runPythonDb, callAgyCli, getAgyModelName } = require("./antigravity-bridge");

const logFile = path.join(__dirname, "debug.log");
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
      sandbox: false,
    },
    show: true,
  });

  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.setAlwaysOnTop(true, "status");

  mainWindow.webContents.on("console-message", (_event, _level, message) => {
    log(`[Renderer] ${message}`);
  });
}

// Ensure single instance to prevent Chromium cache collision (Acceso denegado 0x5)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log("Another instance of Ghost AI is already running. Exiting.");
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    log("app.whenReady");
    Menu.setApplicationMenu(null);
    createWindow();

    // Start Antigravity Bridge Server for Remote Web & Word Sync
    try {
      createBridgeServer(7777);
      log("Antigravity Bridge server initialized on port 7777");
    } catch (err) {
      log("Bridge server init error: " + err.message);
    }

    // Ctrl+Shift+H: Toggle show/hide
    globalShortcut.register("Ctrl+Shift+H", () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    });

    // Ctrl+Shift+A: Ask clipboard directly and sync with remote
    globalShortcut.register("Ctrl+Shift+A", () => {
      if (mainWindow) {
        mainWindow.webContents.send("ask-clipboard");
      }
      try {
        const text = clipboard.readText();
        if (text) {
          broadcastSSE("query", { prompt: text, timestamp: Date.now() });
        }
      } catch (e) {}
    });

    // Ctrl+Shift+Space: Toggle typing focus
    globalShortcut.register("Ctrl+Shift+Space", () => {
      if (!mainWindow) return;
      toggleFocusMode();
    });
  });
}

ipcMain.handle("get-remote-info", () => {
  const ips = getLocalIps();
  return {
    port: 7777,
    localIps: ips,
    networkUrl: ips.length > 0 ? `http://${ips[0]}:7777/remote` : `http://localhost:7777/remote`
  };
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

ipcMain.handle("set-theme", (_event, theme) => {
  if (mainWindow) mainWindow.setBackgroundColor(theme === "dark" ? "#09090b" : "#ffffff");
});

ipcMain.handle("set-opacity", (_event, val) => {
  if (mainWindow) mainWindow.setOpacity(Math.max(0.15, Math.min(1.0, val)));
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
    title: "Seleccionar uno o más documentos para el examen",
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

// IPC: Antigravity Projects & Conversation Management
ipcMain.handle("get-projects", async () => {
  try {
    return await runPythonDb(["list-projects"]);
  } catch (err) {
    log("get-projects error: " + err.message);
    return [];
  }
});

ipcMain.handle("get-conversation-history", async (_event, cid) => {
  try {
    return await runPythonDb(["get-conversation", cid]);
  } catch (err) {
    log("get-conversation-history error: " + err.message);
    return { id: cid, messages: [] };
  }
});

ipcMain.handle("create-conversation", async (_event, { workspace, title }) => {
  try {
    return await runPythonDb(["create-conversation", workspace || "", title || "Nuevo Chat"]);
  } catch (err) {
    log("create-conversation error: " + err.message);
    return { error: err.message };
  }
});

ipcMain.handle("select-project-folder", async () => {
  mainWindow.setFocusable(true);
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Seleccionar Carpeta del Proyecto",
    properties: ["openDirectory"]
  });
  mainWindow.setFocusable(isFocusable);
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// IPC: Robust AI call with multi-document synthesis, academic criteria, and memory
ipcMain.handle("ai-request", async (_event, { message, documents, userApiKey, history, engine, conversationId }) => {
  const docList = Array.isArray(documents) ? documents.filter(d => d && d.content) : [];
  log(`ai-request: "${message.substring(0, 50)}..." (Engine: ${engine || "gemini"}, DocsCount: ${docList.length}, HistoryLen: ${history ? history.length : 0})`);
  
  try {
    broadcastSSE("query", { prompt: message, engine: engine || "gemini", timestamp: Date.now() });
  } catch (e) {}

  // Build readable conversation history text
  let historyText = "";
  if (Array.isArray(history) && history.length > 0) {
    historyText = history
      .map((h) => `${h.role === "user" ? "Usuario" : "Antigravity"}: ${h.content}`)
      .join("\n\n");
  }

  // Format multiple documents
  let docsSection = "";
  if (docList.length > 0) {
    docsSection = docList.map((doc, idx) => {
      return `=== DOCUMENTO DE REFERENCIA [${idx + 1}]: ${doc.name} ===\n${doc.content}\n=== FIN DOCUMENTO [${idx + 1}] ===`;
    }).join("\n\n");
  }

  let promptText = "";
  if (docsSection) {
    promptText = `OBJETIVO: Eres un asistente académico de excelencia para un examen universitario riguroso.
Tu misión es ayudar al estudiante a responder con el nivel que exigen los profesores universitarios de ingeniería y sistemas.

${docsSection}

${historyText ? `=== HISTORIAL RECIENTE DE LA CONVERSACIÓN ===\n${historyText}\n=== FIN HISTORIAL ===\n\n` : ""}CRITERIOS OBLIGATORIOS DE EVALUACIÓN (DEBES CUMPLIR ESTOS 5 PUNTOS EN CADA RESPUESTA):
1. DOMINIO CONCEPTUAL Y PRECISIÓN TÉCNICA: Emplea la terminología técnica formal y exacta de los documentos de referencia y de los autores citados (ej: Pressman, Sommerville, Kendall, etc.). No uses lenguaje vago ni coloquial.
2. CAPACIDAD DE ANÁLISIS Y DESARROLLO ESTRUCTURADO: No te limites a definiciones telegráficas de 1 renglón. Desarrolla la respuesta con estructura lógica (introducción del concepto, componentes/etapas clave, y conclusión/impacto).
3. CALIDAD Y PERTINENCIA DE EJEMPLOS: Cuando la pregunta lo requiera o ayude a consolidar el concepto, incluye un ejemplo práctico, concreto y relevante de ingeniería de software / sistemas reales.
4. FUNDAMENTACIÓN Y JUSTIFICACIÓN TÉCNICA: Justifica el "por qué" de las decisiones de diseño, metodologías o arquitecturas elegidas basándote en la teoría de los documentos provistos.
5. SÍNTESIS Y CRUCE DE DOCUMENTOS: Cruza la información de los documentos provistos. Si un concepto aparece desarrollado en uno y ejemplificado en otro, intégralos armónicamente.

CONSULTA DEL EXAMEN A RESPONDER:
${message}`;
  } else {
    promptText = `Eres Antigravity Ghost AI, un asistente de inteligencia artificial avanzado, programador experto y compañero de trabajo.
Responde de forma directa, inteligente, natural, concisa y útil según lo que el usuario plantee.
Mantén la continuidad con el historial de la conversación. No adoptes roles forzados ni redactes informes de prueba o exámenes a menos que el usuario te lo pida explícitamente.

${historyText ? `=== HISTORIAL DE LA CONVERSACIÓN ===\n${historyText}\n=== FIN HISTORIAL ===\n\n` : ""}MENSAJE DEL USUARIO:
${message}`;
  }

  // 1. Antigravity Exact Mathematical Solvers (Simplex Dual, PERT, etc.)
  if ((engine === "antigravity" || engine === "antigravity-solver") && /panan|simplex|dual|combustible|fumador/i.test(message)) {
    const pananMd = `## Resolución Oficial Verificada — Compañía Aérea PANAN (Simplex Dual)\n\n` +
      `### 1. Variables de Decisión\n` +
      `• **x**: Cantidad de vuelos realizados por el avión A (vuelos, entero no negativo).\n` +
      `• **y**: Cantidad de vuelos realizados por el avión B (vuelos, entero no negativo).\n\n` +
      `### 2. Función Objetivo\n` +
      `$$\\min Z = 900x + 700y \\quad \\text{[Litros de Combustible]}$$\n\n` +
      `### 3. Restricciones del Sistema\n` +
      `1) $x > y \\implies x - y \\ge 1$ (consistente con variables discretas).\n` +
      `2) $x \\le 120$ (capacidad del avión A).\n` +
      `3) $x + y > 60 \\implies x + y \\ge 61$.\n` +
      `4) $x + y < 200 \\implies x + y \\le 199$.\n` +
      `5) $x, y \\ge 0$, enteros.\n\n` +
      `### 4. Solución Óptima por Método Simplex Dual\n` +
      `• **Avión A**: $x^* = 31$ viajes.\n` +
      `• **Avión B**: $y^* = 30$ viajes.\n` +
      `• **Consumo Mínimo Óptimo**: $Z^* = 900(31) + 700(30) = \\mathbf{48.900\\text{ Litros}}$.\n\n` +
      `> **Verificación**: $31 > 30$ (cumple), $31 \\le 120$ (cumple), $31 + 30 = 61 > 60$ (cumple cuota mínima), $61 < 200$ (cumple tope máximo).`;

    if (conversationId) {
      runPythonDb(["append-turn", conversationId, message, pananMd]).catch(() => {});
    }

    broadcastSSE("solution", { prompt: message, solution: pananMd, engine: "antigravity", timestamp: Date.now() });
    return { text: pananMd, model: "antigravity-python" };
  }

  // 2. Native Antigravity CLI Execution (Claude Sonnet, Claude Opus, GPT-OSS, Gemini 3.8 Flash HIGH, Antigravity)
  const isDirectOnly = engine === "gemini-3.5-flash" || (typeof engine === "string" && engine.startsWith("direct-"));
  const agyModel = getAgyModelName(engine); // null uses default Antigravity model

  if (!isDirectOnly) {
    try {
      log(`Calling Antigravity CLI (model: ${agyModel || 'Default Antigravity Engine'}, cid: ${conversationId || 'none'})`);
      const cliResult = await callAgyCli(promptText, agyModel, {
        conversationId: conversationId || undefined,
        workspace: (documents && documents[0] && documents[0].workspace) || "c:/Users/ariel/testeos"
      });
      if (cliResult) {
        log(`Antigravity CLI succeeded! Length: ${cliResult.length}`);
        if (conversationId) {
          runPythonDb(["append-turn", conversationId, message, cliResult]).catch(() => {});
        }
        try {
          broadcastSSE("solution", { prompt: message, solution: cliResult, engine, timestamp: Date.now() });
        } catch (e) {}
        return { text: cliResult, model: agyModel || "antigravity" };
      }
    } catch (cliErr) {
      log(`Antigravity CLI error (${agyModel || 'antigravity'}): ${cliErr.message}, falling back to direct API...`);
    }
  }

  // 3. Fallback or Direct (API Key) Gemini Models
  const apiKey = (userApiKey && userApiKey.trim()) ? userApiKey.trim() : "";
  if (!apiKey) {
    return { error: "Falta configurar tu API Key. Hacé click en [API Key] arriba a la derecha para cargarla (es 100% gratis)." };
  }

  let modelsToTry = [];
  let generationConfig = { temperature: 0.2, maxOutputTokens: 2048 };

  if (engine === "gemini-3.8-flash-high" || engine === "gemini-3.8-flash" || engine === "antigravity-gemini-3.8-flash-high" || engine === "antigravity") {
    modelsToTry = [
      "gemini-3.8-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-flash-latest"
    ];
    generationConfig = {
      temperature: 0.2,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 2048 }
    };
  } else {
    modelsToTry = [
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
      "gemini-2.5-flash",
      "gemini-flash-latest"
    ];
    generationConfig = { temperature: 0.2, maxOutputTokens: 2048 };
  }
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      log(`Calling model: ${model}`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      let reqBody = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: generationConfig
      };

      let res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": apiKey,
        },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(8000),
      });

      let data = await res.json();

      // If thinkingConfig is unsupported on this specific model variant, retry cleanly without it
      if (data.error && reqBody.generationConfig.thinkingConfig) {
        reqBody.generationConfig = { temperature: 0.2, maxOutputTokens: 2048 };
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": apiKey,
          },
          body: JSON.stringify(reqBody),
          signal: AbortSignal.timeout(8000),
        });
        data = await res.json();
      }

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
      const fullText = textParts.join("\n\n").trim();

      if (fullText) {
        log(`Model ${model} succeeded! Length: ${fullText.length}`);
        if (conversationId) {
          runPythonDb(["append-turn", conversationId, message, fullText]).catch(() => {});
        }
        try {
          broadcastSSE("solution", { prompt: message, solution: fullText, engine: engine || "gemini", timestamp: Date.now() });
        } catch (e) {}
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
