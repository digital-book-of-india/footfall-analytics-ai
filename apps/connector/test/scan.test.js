const test = require("node:test");
const assert = require("node:assert/strict");
const { createScanner, mapDescribeToProbeResult, buildUrl } = require("../src/lib/scan");

const BASE = "rtsp://admin:p%40ss%23w@192.168.1.10:554";

test("DESCRIBE status mapping", () => {
  assert.deepEqual(mapDescribeToProbeResult({ status: 200 }), { reachable: true });
  assert.deepEqual(mapDescribeToProbeResult({ status: 401 }), { reachable: false, errorCode: "AUTH_FAILED" });
  assert.deepEqual(mapDescribeToProbeResult({ status: 403 }), { reachable: false, errorCode: "AUTH_FAILED" });
  assert.deepEqual(mapDescribeToProbeResult({ status: 404 }), { reachable: false, errorCode: "STREAM_PATH_NOT_FOUND" });
  assert.deepEqual(mapDescribeToProbeResult({ status: null, error: "ETIMEDOUT" }), {
    reachable: false,
    errorCode: "NO_RTSP_RESPONSE",
  });
});

test("buildUrl swaps path/query but keeps host and encoded credentials", () => {
  const url = buildUrl(`${BASE}/old`, "/cam/realmonitor?channel=3&subtype=1");
  const u = new URL(url);
  assert.equal(u.hostname, "192.168.1.10");
  assert.equal(u.pathname, "/cam/realmonitor");
  assert.equal(u.search, "?channel=3&subtype=1");
  assert.equal(decodeURIComponent(u.password), "p@ss#w");
});

/** Fake recorder: `channels` answer 200 with video, `noVideo` answer 200 without a video track. */
function fakeRecorder({ scheme = "hik", channels = [], subChannels = null, noVideo = [], authFail = false } = {}) {
  const calls = [];
  const subOk = new Set(subChannels ?? channels);
  const describe = async (url) => {
    calls.push(url);
    if (authFail) return { status: 401 };
    const u = new URL(url);
    let n = null;
    let sub = false;
    if (scheme === "hik") {
      const m = u.pathname.match(/^\/Streaming\/Channels\/(\d+?)0([12])$/);
      if (m) {
        n = Number(m[1]);
        sub = m[2] === "2";
      }
    } else {
      const m = u.pathname === "/cam/realmonitor" && u.search.match(/channel=(\d+)&subtype=([01])/);
      if (m) {
        n = Number(m[1]);
        sub = m[2] === "1";
      }
    }
    if (n === null) return { status: 404 };
    if (noVideo.includes(n)) return { status: 200, hasVideo: false };
    if (!channels.includes(n)) return { status: 404 };
    if (sub && !subOk.has(n)) return { status: 404 };
    return { status: 200, hasVideo: true };
  };
  return { describe, calls };
}

function scanner(fake, extra = {}) {
  return createScanner({
    tcpProbe: async () => ({ reachable: true }),
    describe: fake.describe,
    grabThumbnail: async (url) => `thumb:${new URL(url).pathname}${new URL(url).search}`,
    parsePath: (url) => new URL(url).pathname + new URL(url).search,
    retryDelayMs: 0,
    ...extra,
  });
}

test("channel scan: Hikvision recorder, only channels with video, prefers sub stream, thumbnails", async () => {
  const fake = fakeRecorder({ channels: [1, 2, 5], noVideo: [3] });
  const result = await scanner(fake).discoverChannels(`${BASE}/Streaming/Channels/101`);

  assert.equal(result.error, undefined);
  assert.deepEqual(
    result.channels.map((c) => [c.channel, c.path]),
    [
      [1, "/Streaming/Channels/102"],
      [2, "/Streaming/Channels/202"],
      [5, "/Streaming/Channels/502"],
    ]
  );
  assert.ok(result.channels.every((c) => c.thumbnail && c.thumbnail.startsWith("thumb:")));
  assert.equal(result.channels[0].label, "Channel 1");
});

test("channel scan: falls back to main stream when sub stream has no video", async () => {
  const fake = fakeRecorder({ channels: [1, 2], subChannels: [1] });
  const result = await scanner(fake).discoverChannels(`${BASE}/Streaming/Channels/101`);
  assert.deepEqual(
    result.channels.map((c) => c.path),
    ["/Streaming/Channels/102", "/Streaming/Channels/201"]
  );
});

test("channel scan: detects Dahua when the given path is unknown", async () => {
  const fake = fakeRecorder({ scheme: "dahua", channels: [1, 4] });
  const result = await scanner(fake).discoverChannels(`${BASE}/`);
  assert.deepEqual(
    result.channels.map((c) => [c.channel, c.path]),
    [
      [1, "/cam/realmonitor?channel=1&subtype=1"],
      [4, "/cam/realmonitor?channel=4&subtype=1"],
    ]
  );
});

test("channel scan: scans at most 32 channels", async () => {
  const fake = fakeRecorder({ channels: [1] });
  await scanner(fake).discoverChannels(`${BASE}/Streaming/Channels/101`);
  const mainCalls = fake.calls.filter((u) => /\/Streaming\/Channels\/\d+01$/.test(u));
  const numbers = new Set(mainCalls.map((u) => Number(u.match(/Channels\/(\d+)01$/)[1])));
  assert.equal(Math.max(...numbers), 32);
  assert.equal(numbers.has(33), false);
});

test("channel scan: AUTH_FAILED is reported, not 'no channels'", async () => {
  const result = await scanner(fakeRecorder({ authFail: true })).discoverChannels(`${BASE}/Streaming/Channels/101`);
  assert.equal(result.error, "AUTH_FAILED");
  assert.deepEqual(result.channels, []);
});

test("channel scan: unreachable host surfaces the TCP error code", async () => {
  const result = await scanner(fakeRecorder(), {
    tcpProbe: async () => ({ reachable: false, errorCode: "CONNECTION_REFUSED" }),
  }).discoverChannels(`${BASE}/`);
  assert.equal(result.error, "CONNECTION_REFUSED");
});

test("channel scan: a single IP camera returns itself", async () => {
  const describe = async (url) => (new URL(url).pathname === "/stream1" ? { status: 200, hasVideo: true } : { status: 404 });
  const result = await scanner({ describe }).discoverChannels(`${BASE}/stream1`);
  assert.equal(result.channels.length, 1);
  assert.equal(result.channels[0].path, "/stream1");
  assert.equal(result.channels[0].label, "This camera");
});

test("channel scan: nothing found -> NO_CHANNELS_FOUND", async () => {
  const result = await scanner(fakeRecorder({ channels: [] })).discoverChannels(`${BASE}/Streaming/Channels/101`);
  assert.equal(result.error, "NO_CHANNELS_FOUND");
});

test("a no-answer DESCRIBE is retried once", async () => {
  let n = 0;
  const describe = async () => {
    n += 1;
    return n === 1 ? { status: null, error: "TIMEOUT" } : { status: 200, hasVideo: true };
  };
  const result = await scanner({ describe }).probeCamera(`${BASE}/stream1`);
  assert.deepEqual(result, { reachable: true });
  assert.equal(n, 2);
});

test("probe: TCP failure is returned as-is, DESCRIBE 401/404 map to specific codes", async () => {
  const down = scanner({ describe: async () => ({ status: 200 }) }, {
    tcpProbe: async () => ({ reachable: false, errorCode: "CONNECTION_TIMEOUT" }),
  });
  assert.deepEqual(await down.probeCamera(BASE), { reachable: false, errorCode: "CONNECTION_TIMEOUT" });

  assert.deepEqual(await scanner({ describe: async () => ({ status: 401 }) }).probeCamera(BASE), {
    reachable: false,
    errorCode: "AUTH_FAILED",
  });
  assert.deepEqual(await scanner({ describe: async () => ({ status: 404 }) }).probeCamera(BASE), {
    reachable: false,
    errorCode: "STREAM_PATH_NOT_FOUND",
  });
});
