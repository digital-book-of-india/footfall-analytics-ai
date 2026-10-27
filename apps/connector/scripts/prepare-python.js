// Embeds a standalone Python + OpenCV runtime and the go2rtc binary into
// build-resources/, which electron-builder then ships as `extraResources` (see
// package.json). This lets a packaged DBI Footfall Connector run the Python AI worker
// and bridge WebRTC without the shop PC having Python/go2rtc installed.
//
// Idempotent: re-running skips steps whose output already exists. Network/tooling
// failures throw loudly rather than leaving a half-built resource folder silently broken.
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const PY_VERSION = "3.12.8";
const GO2RTC_VERSION = "1.9.9";

const ROOT = path.join(__dirname, "..");
const RESOURCES_DIR = path.join(ROOT, "build-resources");
const PYTHON_DIR = path.join(RESOURCES_DIR, "python");
const GO2RTC_DIR = path.join(RESOURCES_DIR, "go2rtc");
const AI_WORKER_DST = path.join(RESOURCES_DIR, "ai-worker", "src");
const AI_WORKER_SRC = path.join(ROOT, "..", "ai-worker", "src");
const READY_MARKER = path.join(PYTHON_DIR, ".footfall-ready");

function download(url, destFile) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destFile);
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(destFile);
          download(res.headers.location, destFile).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed (${res.statusCode}): ${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (err) => {
        fs.unlink(destFile, () => {});
        reject(err);
      });
  });
}

// Windows ships bsdtar (zip-capable) as System32\tar.exe. A bare "tar" on PATH is not
// reliable: Git for Windows puts its own GNU tar (no zip support at all) earlier on PATH
// on many dev machines, which fails with "This does not look like a tar archive". Call
// the real one by its known, fixed location instead of trusting PATH order.
const SYSTEM_TAR = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");

function extractZipWithTar(zipFile, destDir) {
  // Calling the real System32 bsdtar by its known path (instead of a bare "tar" that
  // PATH order could resolve to Git's GNU tar) already avoids the "D:\..." colon being
  // misread as [user@]host:path remote-tar syntax, so no extra flag is needed here -
  // and Microsoft's build of bsdtar doesn't support --force-local at all.
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync(SYSTEM_TAR, ["-xf", zipFile, "-C", destDir], { stdio: "inherit" });
}

function copyDirRecursive(src, dst, { excludeDirs = [] } = {}) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludeDirs.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath, { excludeDirs });
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

async function preparePython() {
  if (fs.existsSync(READY_MARKER)) {
    console.log("[prepare-python] embedded Python already prepared, skipping");
    return;
  }

  fs.mkdirSync(PYTHON_DIR, { recursive: true });
  const zipPath = path.join(RESOURCES_DIR, `python-${PY_VERSION}-embed-amd64.zip`);
  const zipUrl = `https://www.python.org/ftp/python/${PY_VERSION}/python-${PY_VERSION}-embed-amd64.zip`;

  console.log(`[prepare-python] downloading embeddable Python ${PY_VERSION}...`);
  await download(zipUrl, zipPath);
  extractZipWithTar(zipPath, PYTHON_DIR);
  fs.unlinkSync(zipPath);

  const pthFile = fs
    .readdirSync(PYTHON_DIR)
    .find((f) => /^python3\d+\._pth$/.test(f));
  if (!pthFile) throw new Error("[prepare-python] could not find the embeddable Python's ._pth file");

  const pthPath = path.join(PYTHON_DIR, pthFile);
  let pthContents = fs.readFileSync(pthPath, "utf8");
  pthContents = pthContents.replace(/^#\s*import site/m, "import site");
  if (!pthContents.includes("ai-worker")) {
    pthContents += "\n..\\ai-worker\\src\n";
  }
  fs.writeFileSync(pthPath, pthContents, "utf8");

  console.log("[prepare-python] bootstrapping pip...");
  const getPipPath = path.join(PYTHON_DIR, "get-pip.py");
  await download("https://bootstrap.pypa.io/get-pip.py", getPipPath);
  execFileSync(path.join(PYTHON_DIR, "python.exe"), [getPipPath, "--no-warn-script-location"], {
    stdio: "inherit",
  });
  fs.unlinkSync(getPipPath);

  const requirementsPath = path.join(AI_WORKER_SRC, "..", "requirements.txt");
  console.log("[prepare-python] installing ai-worker requirements...");
  execFileSync(
    path.join(PYTHON_DIR, "python.exe"),
    ["-m", "pip", "install", "--no-warn-script-location", "-r", requirementsPath],
    { stdio: "inherit" }
  );

  fs.writeFileSync(READY_MARKER, new Date().toISOString(), "utf8");
  console.log("[prepare-python] embedded Python ready");
}

async function prepareGo2rtc() {
  const exePath = path.join(GO2RTC_DIR, "go2rtc.exe");
  if (fs.existsSync(exePath)) {
    console.log("[prepare-python] go2rtc already present, skipping");
    return;
  }

  fs.mkdirSync(GO2RTC_DIR, { recursive: true });
  const zipPath = path.join(RESOURCES_DIR, "go2rtc_win64.zip");
  const zipUrl = `https://github.com/AlexxIT/go2rtc/releases/download/v${GO2RTC_VERSION}/go2rtc_win64.zip`;

  console.log(`[prepare-python] downloading go2rtc ${GO2RTC_VERSION}...`);
  await download(zipUrl, zipPath);
  extractZipWithTar(zipPath, GO2RTC_DIR);
  fs.unlinkSync(zipPath);

  if (!fs.existsSync(exePath)) {
    throw new Error("[prepare-python] go2rtc.exe not found after extraction");
  }
}

function prepareAiWorkerSource() {
  console.log("[prepare-python] copying ai-worker source...");
  if (fs.existsSync(AI_WORKER_DST)) {
    fs.rmSync(AI_WORKER_DST, { recursive: true, force: true });
  }
  copyDirRecursive(AI_WORKER_SRC, AI_WORKER_DST, { excludeDirs: ["__pycache__"] });
}

async function main() {
  fs.mkdirSync(RESOURCES_DIR, { recursive: true });
  await preparePython();
  await prepareGo2rtc();
  prepareAiWorkerSource();
  console.log("[prepare-python] done");
}

main().catch((err) => {
  console.error("[prepare-python] FAILED:", err.message);
  process.exit(1);
});
