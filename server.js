/**
 * Local development server.
 *
 * Vercel serves the static files and api/weather.js automatically in
 * production. This tiny zero-dependency server mirrors that behaviour so
 * the app can be developed and tested with `npm run dev`.
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

loadEnvFile();

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;

    let value = (match[2] || "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

function send(res, status, body, contentType) {
  res.writeHead(status, {
    "Content-Type": contentType || "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

async function handleApi(req, res, url) {
  const handler = require("./api/weather.js");

  const fakeReq = {
    method: req.method,
    url: req.url,
    headers: req.headers,
    query: Object.fromEntries(url.searchParams),
  };

  const fakeRes = {
    statusCode: 200,
    headers: {},
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    getHeader(key) {
      return this.headers[key.toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.setHeader("Content-Type", "application/json; charset=utf-8");
      res.writeHead(this.statusCode, this.headers);
      res.end(JSON.stringify(body));
    },
    end(body) {
      res.writeHead(this.statusCode, this.headers);
      res.end(body);
    },
  };

  try {
    await handler(fakeReq, fakeRes);
  } catch (error) {
    console.error("[dev] API handler crashed:", error);
    if (!res.headersSent) {
      send(res, 500, JSON.stringify({ error: { code: "dev_error", message: "Local API handler crashed." } }), "application/json; charset=utf-8");
    }
  }
}

function serveStatic(res, pathname) {
  let requested;
  try {
    requested = decodeURIComponent(pathname);
  } catch (error) {
    return send(res, 400, "Bad request");
  }

  if (requested === "/") requested = "/index.html";

  const normalized = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, normalized);

  if (!filePath.startsWith(ROOT + path.sep)) {
    return send(res, 403, "Forbidden");
  }

  const relative = path.relative(ROOT, filePath).split(path.sep);
  const blocked = relative.some((segment) =>
    segment.startsWith(".") ||
    segment === "node_modules" ||
    segment === "api" ||
    segment === "server.js" ||
    segment === "vercel.json" ||
    segment === "package.json" ||
    segment === "package-lock.json"
  );

  if (blocked) {
    return send(res, 404, "Not found");
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      return send(res, 404, "Not found");
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });

    fs.createReadStream(filePath)
      .on("error", () => {
        if (!res.headersSent) send(res, 500, "Internal server error");
        else res.destroy();
      })
      .pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/weather") {
    return handleApi(req, res, url);
  }

  if (url.pathname === "/favicon.ico") {
    return serveStatic(res, "/favicon.svg");
  }

  return serveStatic(res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Skyline Weather running at http://localhost:${PORT}`);
  if (!process.env.WEATHER_API_KEY) {
    console.warn("Warning: WEATHER_API_KEY is missing. Add it to .env before searching.");
  }
});
