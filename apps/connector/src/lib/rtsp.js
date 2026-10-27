const net = require("net");
const crypto = require("crypto");
const { URL } = require("url");

// Minimal hand-rolled RTSP client used only to check that a camera answers RTSP and to
// read its SDP (so we know whether it actually offers a video track) - this is a login/
// health check, not a stream reader. Never log the parsed URL's credentials.

function parseUrl(rtspUrl) {
  const u = new URL(rtspUrl);
  const host = u.hostname;
  const port = u.port ? Number(u.port) : 554;
  const user = decodeURIComponent(u.username || "");
  const pass = decodeURIComponent(u.password || "");
  const path = `${u.pathname || "/"}${u.search || ""}`;
  const uri = `rtsp://${host}:${port}${path}`;
  return { host, port, user, pass, path, uri };
}

function sanitizeFirstLine(buf) {
  const text = buf.toString("latin1");
  const line = text.split(/\r?\n/, 1)[0] || "";
  return line.slice(0, 120);
}

// One TCP socket, used for a short back-and-forth of RTSP requests/responses.
class Session {
  constructor(host, port, timeoutMs) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    this.failure = null; // set on error/timeout/close before any usable response
  }

  open() {
    return new Promise((resolve, reject) => {
      this.socket = net.connect({ host: this.host, port: this.port });
      this.socket.setTimeout(this.timeoutMs);

      // Always-on safety net for this socket's whole lifetime: without at least one
      // 'error' listener attached at all times, a camera that resets the connection in
      // the gap between two requests (common right after a 401 challenge) throws an
      // uncaught exception on this socket and takes down the whole process.
      this.socket.on("error", (err) => {
        this.failure = err.code || "ECONNERROR";
      });

      const onError = (err) => {
        this.failure = err.code || "ECONNERROR";
        cleanup();
        reject(err);
      };
      const onTimeout = () => {
        this.failure = "TIMEOUT";
        const err = new Error("RTSP connect timed out");
        cleanup();
        this.socket.destroy();
        reject(err);
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        this.socket.removeListener("error", onError);
        this.socket.removeListener("timeout", onTimeout);
        this.socket.removeListener("connect", onConnect);
      };

      this.socket.once("error", onError);
      this.socket.once("timeout", onTimeout);
      this.socket.once("connect", onConnect);
    });
  }

  // Sends one RTSP request and waits for one full response (status line + headers +
  // Content-Length-bounded body, if any). Resolves to { status, headers, body } on a
  // recognisable RTSP response, or { status: null, raw } if the peer answered with
  // something that isn't an RTSP status line (e.g. an HTTP page, or garbage).
  sendRequest(requestText) {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error("RTSP session already closed"));
        return;
      }

      let settled = false;
      let expectedLength = null;
      let headerEnd = -1;

      const tryParse = () => {
        if (headerEnd < 0) {
          headerEnd = this.buffer.indexOf("\r\n\r\n");
          if (headerEnd < 0) return false;
        }
        const headerText = this.buffer.slice(0, headerEnd).toString("latin1");
        const lines = headerText.split("\r\n");
        const statusLine = lines[0] || "";
        const statusMatch = statusLine.match(/^RTSP\/1\.0\s+(\d{3})/);

        if (!statusMatch) {
          finish({ status: null, raw: sanitizeFirstLine(this.buffer) });
          this.buffer = Buffer.alloc(0);
          return true;
        }

        const headers = {};
        for (const line of lines.slice(1)) {
          const idx = line.indexOf(":");
          if (idx < 0) continue;
          headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
        }

        if (expectedLength === null) {
          expectedLength = headers["content-length"] ? parseInt(headers["content-length"], 10) || 0 : 0;
        }

        const bodyStart = headerEnd + 4;
        const available = this.buffer.length - bodyStart;
        if (available < expectedLength) return false;

        const body = this.buffer.slice(bodyStart, bodyStart + expectedLength).toString("utf8");
        const consumedThrough = bodyStart + expectedLength;
        finish({ status: parseInt(statusMatch[1], 10), headers, body });
        // Trim off exactly what this response consumed - leftover bytes (if the peer
        // already started sending the next response) stay for the next sendRequest().
        // Without this, a second request on the same session re-parses the FIRST
        // response's bytes from the front of the buffer and gets garbage.
        this.buffer = this.buffer.slice(consumedThrough);
        return true;
      };

      const finish = (result) => {
        if (settled) return;
        settled = true;
        this.socket.removeListener("data", onData);
        this.socket.removeListener("error", onError);
        this.socket.removeListener("timeout", onTimeout);
        this.socket.removeListener("close", onClose);
        resolve(result);
      };

      const onData = (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        try {
          tryParse();
        } catch (err) {
          finish({ status: null, raw: sanitizeFirstLine(this.buffer) });
        }
      };
      const onError = (err) => {
        if (settled) return;
        this.failure = err.code || "ECONNERROR";
        settled = true;
        reject(err);
      };
      const onTimeout = () => {
        if (settled) return;
        this.failure = "TIMEOUT";
        settled = true;
        this.socket.destroy();
        reject(new Error("RTSP request timed out"));
      };
      const onClose = () => {
        if (settled) return;
        this.failure = "CLOSED";
        settled = true;
        reject(new Error("RTSP connection closed before a response"));
      };

      this.socket.on("data", onData);
      this.socket.on("error", onError);
      this.socket.on("timeout", onTimeout);
      this.socket.on("close", onClose);
      this.socket.write(requestText);

      // Leftover bytes from a previous request on this same session.
      if (this.buffer.length) {
        try {
          if (tryParse()) return;
        } catch {
          // fall through, wait for more data
        }
      }
    });
  }

  close() {
    this.closed = true;
    if (this.socket && !this.socket.destroyed) this.socket.destroy();
  }
}

function request(method, uri, cseq, authHeader, extraHeaders = {}) {
  const headers = [
    `${method} ${uri} RTSP/1.0`,
    `CSeq: ${cseq}`,
    "User-Agent: FootfallConnector",
  ];
  if (method === "DESCRIBE") headers.push("Accept: application/sdp");
  if (authHeader) headers.push(`Authorization: ${authHeader}`);
  for (const [key, value] of Object.entries(extraHeaders)) headers.push(`${key}: ${value}`);
  headers.push("", "");
  return headers.join("\r\n");
}

function md5(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

function parseWwwAuthenticate(headerValue) {
  if (!headerValue) return null;
  // There can be multiple challenges; prefer Digest over Basic.
  const challenges = [];
  const re = /(Digest|Basic)\s+([^,]+(?:,\s*[a-zA-Z]+=(?:"[^"]*"|[^,]*))*)/g;
  let match;
  while ((match = re.exec(headerValue))) {
    challenges.push({ scheme: match[1], raw: match[2] });
  }
  if (!challenges.length) return null;
  const digest = challenges.find((c) => c.scheme === "Digest");
  const chosen = digest || challenges[0];

  const params = {};
  const paramRe = /([a-zA-Z]+)=(?:"([^"]*)"|([^,]*))/g;
  let p;
  while ((p = paramRe.exec(chosen.raw))) {
    params[p[1]] = p[2] !== undefined ? p[2] : p[3];
  }
  return { scheme: chosen.scheme, params };
}

let nonceCounter = 0;

function digestHeader(challenge, { method, uri, user, pass }) {
  const { realm, nonce, qop, opaque } = challenge.params;
  const ha1 = md5(`${user}:${realm}:${pass}`);
  const ha2 = md5(`${method}:${uri}`);

  let response;
  let extra = "";
  if (qop && /auth/i.test(qop)) {
    nonceCounter += 1;
    const nc = String(nonceCounter).padStart(8, "0");
    const cnonce = crypto.randomBytes(8).toString("hex");
    response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`);
    extra = `, qop=auth, nc=${nc}, cnonce="${cnonce}"`;
  } else {
    response = md5(`${ha1}:${nonce}:${ha2}`);
  }

  let header =
    `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", ` +
    `response="${response}"${extra}`;
  if (opaque) header += `, opaque="${opaque}"`;
  return header;
}

function basicHeader(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

function authorizationFor(wwwAuthHeader, { method, uri, user, pass }) {
  const challenge = parseWwwAuthenticate(wwwAuthHeader);
  if (!challenge) return null;
  if (challenge.scheme === "Digest") return digestHeader(challenge, { method, uri, user, pass });
  return basicHeader(user, pass);
}

async function describeOnce(session, { host, port, uri, user, pass }, authHeader) {
  let cseq = 1;
  // Mimic ffmpeg/VLC: send a plain OPTIONS first (response ignored) - some cameras behave
  // better after it and refuse a bare DESCRIBE.
  try {
    await session.sendRequest(request("OPTIONS", `rtsp://${host}:${port}/`, cseq, null));
  } catch {
    // ignore - this is best-effort warm-up, not required for the DESCRIBE below
  }
  cseq += 1;

  const res = await session.sendRequest(request("DESCRIBE", uri, cseq, authHeader));
  return res;
}

// Checks a camera's RTSP endpoint and whether its SDP advertises a video track.
// Returns { status, hasVideo } on a real RTSP answer, or { status: null, error } if the
// camera never gave a usable RTSP response at all.
async function describe(streamUrl, timeoutMs = 4000) {
  const { host, port, uri, user, pass } = parseUrl(streamUrl);

  let session = new Session(host, port, timeoutMs);
  try {
    await session.open();
  } catch (err) {
    return { status: null, error: session.failure || err.code || "ECONNERROR" };
  }

  let res;
  try {
    res = await describeOnce(session, { host, port, uri, user, pass }, null);
  } catch (err) {
    const failure = session.failure || "ECONNERROR";
    session.close();
    return { status: null, error: failure };
  }

  if (res.status === 401) {
    const authHeader = authorizationFor(res.headers["www-authenticate"], {
      method: "DESCRIBE",
      uri,
      user,
      pass,
    });
    if (!authHeader) {
      session.close();
      return { status: 401 };
    }

    let retryRes;
    try {
      retryRes = await session.sendRequest(request("DESCRIBE", uri, 3, authHeader));
    } catch {
      // Some cameras hang up right after issuing the 401 challenge - open a fresh
      // session and retry once more with the computed auth header.
      session.close();
      session = new Session(host, port, timeoutMs);
      try {
        await session.open();
        retryRes = await session.sendRequest(request("DESCRIBE", uri, 1, authHeader));
      } catch (err2) {
        const failure = session.failure || "ECONNERROR";
        session.close();
        return { status: null, error: failure };
      }
    }
    res = retryRes;
  }

  session.close();

  if (res.status === null) {
    return { status: null, error: "NOT_RTSP_RESPONSE" };
  }

  const hasVideo = res.status === 200 && /^m=video/m.test(res.body || "");
  return { status: res.status, hasVideo };
}

module.exports = { parseUrl, describe, Session };
