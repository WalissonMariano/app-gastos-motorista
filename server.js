const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const DB = path.join(ROOT, "database");
const PORT = Number(process.env.PORT) || 3000;
const SESSION_MS = 24 * 60 * 60 * 1000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(DB, file), "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(path.join(DB, file), `${JSON.stringify(data, null, 2)}\n`);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    driverId: user.driverId || null,
  };
}

function loadSessions() {
  try {
    return readJson("sessions.json").filter((item) => item.expiresAt > Date.now());
  } catch {
    return [];
  }
}

function saveSessions(sessions) {
  writeJson(
    "sessions.json",
    sessions.filter((item) => item.expiresAt > Date.now())
  );
}

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        req.destroy();
        reject(new Error("Payload muito grande"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("JSON inválido"));
      }
    });
  });
}

function currentUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const session = loadSessions().find((item) => item.token === token);
  if (!session) return null;
  const user = readJson("users.json").find((item) => item.id === session.userId);
  return user || null;
}

function scopedData(user) {
  const drivers = readJson("drivers.json");
  const transactions = readJson("transactions.json");
  if (user.role === "admin") {
    return { user: publicUser(user), drivers, transactions };
  }
  return {
    user: publicUser(user),
    drivers: drivers.filter((item) => item.id === user.driverId),
    transactions: transactions.filter((item) => item.driverId === user.driverId),
  };
}

function canAccessDriver(user, driverId) {
  return user.role === "admin" || user.driverId === driverId;
}

function serveStatic(req, res, urlPath) {
  const safePath = urlPath === "/" ? "/index.html" : urlPath;
  if (!safePath.startsWith("/css/") && !safePath.startsWith("/js/") && safePath !== "/index.html") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const filePath = path.normalize(path.join(ROOT, safePath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "text/plain" });
    res.end(data);
  });
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  if (route === "POST /api/login") {
    const body = await readBody(req);
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = readJson("users.json").find(
      (item) => item.username === username && item.password === password
    );
    if (!user) {
      send(res, 401, { error: "Usuário ou senha inválidos." });
      return;
    }
    const sessions = loadSessions();
    const token = crypto.randomBytes(24).toString("hex");
    sessions.push({
      token,
      userId: user.id,
      expiresAt: Date.now() + SESSION_MS,
    });
    saveSessions(sessions);
    send(res, 200, { token, ...scopedData(user) });
    return;
  }

  const user = currentUser(req);
  if (!user) {
    send(res, 401, { error: "Faça login para continuar." });
    return;
  }

  if (route === "POST /api/logout") {
    const token = (req.headers.authorization || "").slice(7);
    saveSessions(loadSessions().filter((item) => item.token !== token));
    send(res, 200, { ok: true });
    return;
  }

  if (route === "GET /api/data") {
    send(res, 200, scopedData(user));
    return;
  }

  if (route === "POST /api/drivers") {
    if (user.role !== "admin") {
      send(res, 403, { error: "Apenas o administrador cadastra motoristas." });
      return;
    }
    const body = await readBody(req);
    const drivers = readJson("drivers.json");
    const driver = {
      id: body.id || `drv-${crypto.randomBytes(4).toString("hex")}`,
      name: String(body.name || "").trim(),
      vehicle: String(body.vehicle || "").trim() || "Veículo não informado",
      plate: String(body.plate || "").trim().toUpperCase() || "—",
    };
    if (!driver.name) {
      send(res, 400, { error: "Informe o nome do motorista." });
      return;
    }
    drivers.push(driver);
    writeJson("drivers.json", drivers);
    send(res, 201, driver);
    return;
  }

  const driverMatch = url.pathname.match(/^\/api\/drivers\/([^/]+)$/);
  if (driverMatch && (req.method === "PUT" || req.method === "DELETE")) {
    if (user.role !== "admin") {
      send(res, 403, { error: "Apenas o administrador altera motoristas." });
      return;
    }
    const id = decodeURIComponent(driverMatch[1]);
    let drivers = readJson("drivers.json");
    if (!drivers.some((item) => item.id === id)) {
      send(res, 404, { error: "Motorista não encontrado." });
      return;
    }
    if (req.method === "DELETE") {
      drivers = drivers.filter((item) => item.id !== id);
      writeJson("drivers.json", drivers);
      writeJson(
        "transactions.json",
        readJson("transactions.json").filter((item) => item.driverId !== id)
      );
      send(res, 200, { ok: true });
      return;
    }
    const body = await readBody(req);
    drivers = drivers.map((item) =>
      item.id === id
        ? {
            ...item,
            name: String(body.name || "").trim() || item.name,
            vehicle: String(body.vehicle || "").trim() || item.vehicle,
            plate: String(body.plate || "").trim().toUpperCase() || item.plate,
          }
        : item
    );
    writeJson("drivers.json", drivers);
    send(res, 200, drivers.find((item) => item.id === id));
    return;
  }

  if (route === "POST /api/transactions") {
    const body = await readBody(req);
    const driverId = user.role === "admin" ? body.driverId : user.driverId;
    if (!canAccessDriver(user, driverId)) {
      send(res, 403, { error: "Sem permissão para este motorista." });
      return;
    }
    const transaction = {
      id: body.id || `tx-${crypto.randomBytes(4).toString("hex")}`,
      driverId,
      type: body.type === "despesa" ? "despesa" : "receita",
      category: String(body.category || ""),
      amount: Number(body.amount),
      date: String(body.date || ""),
      payment: String(body.payment || "pix"),
      description: String(body.description || "").trim(),
      createdAt: Number(body.createdAt) || Date.now(),
    };
    if (!transaction.amount || transaction.amount <= 0 || !transaction.date) {
      send(res, 400, { error: "Preencha valor e data válidos." });
      return;
    }
    const transactions = readJson("transactions.json");
    transactions.push(transaction);
    writeJson("transactions.json", transactions);
    send(res, 201, transaction);
    return;
  }

  const txMatch = url.pathname.match(/^\/api\/transactions\/([^/]+)$/);
  if (txMatch && (req.method === "PUT" || req.method === "DELETE")) {
    const id = decodeURIComponent(txMatch[1]);
    let transactions = readJson("transactions.json");
    const current = transactions.find((item) => item.id === id);
    if (!current) {
      send(res, 404, { error: "Lançamento não encontrado." });
      return;
    }
    if (!canAccessDriver(user, current.driverId)) {
      send(res, 403, { error: "Sem permissão para este lançamento." });
      return;
    }
    if (req.method === "DELETE") {
      writeJson(
        "transactions.json",
        transactions.filter((item) => item.id !== id)
      );
      send(res, 200, { ok: true });
      return;
    }
    const body = await readBody(req);
    const driverId = user.role === "admin" ? body.driverId || current.driverId : current.driverId;
    if (!canAccessDriver(user, driverId)) {
      send(res, 403, { error: "Sem permissão para este motorista." });
      return;
    }
    const updated = {
      ...current,
      driverId,
      type: body.type === "despesa" ? "despesa" : "receita",
      category: String(body.category || current.category),
      amount: Number(body.amount),
      date: String(body.date || current.date),
      payment: String(body.payment || current.payment),
      description: String(body.description || "").trim(),
    };
    if (!updated.amount || updated.amount <= 0) {
      send(res, 400, { error: "Informe um valor válido." });
      return;
    }
    transactions = transactions.map((item) => (item.id === id ? updated : item));
    writeJson("transactions.json", transactions);
    send(res, 200, updated);
    return;
  }

  send(res, 404, { error: "Rota não encontrada." });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (error) {
    send(res, 400, { error: error.message || "Falha na requisição." });
  }
});

server.listen(PORT, () => {
  console.log(`Giro disponível em http://localhost:${PORT}`);
});
