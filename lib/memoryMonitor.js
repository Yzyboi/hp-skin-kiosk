// Periodic memory snapshots, logged to stdout (visible in Render/Railway
// logs, timestamp-correlatable with the platform's own memory graph) plus
// exposed on-demand via an admin endpoint (see routes/admin.js).
//
// The platform's memory graph only shows RSS as a single number - it
// can't tell you whether that's real, live JS objects (process.memoryUsage
// ().heapUsed - would mean something in the app is actually holding onto
// growing state, worth hunting down) or memory V8/glibc are just not
// handing back to the OS after a busy period (heapUsed stays flat/small
// while rss stays elevated - normal-ish native allocator behavior, not a
// bug in this app). This is the breakdown that answers that question.

function snapshot() {
  const mem = process.memoryUsage();
  const toMB = (bytes) => Math.round((bytes / (1024 * 1024)) * 10) / 10;
  return {
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    rssMB: toMB(mem.rss),
    heapUsedMB: toMB(mem.heapUsed),
    heapTotalMB: toMB(mem.heapTotal),
    externalMB: toMB(mem.external),
    arrayBuffersMB: toMB(mem.arrayBuffers),
    // rss minus everything V8 itself accounts for - if this is large and
    // growing while heapUsed stays flat, that's memory outside the JS
    // heap entirely (native allocator overhead/fragmentation, e.g. from
    // sharp/libvips), not objects the app is holding a reference to.
    unaccountedMB: toMB(mem.rss - mem.heapTotal - mem.external)
  };
}

function logSnapshot() {
  const s = snapshot();
  console.log(
    `[memory] rss=${s.rssMB}MB heapUsed=${s.heapUsedMB}MB heapTotal=${s.heapTotalMB}MB ` +
      `external=${s.externalMB}MB arrayBuffers=${s.arrayBuffersMB}MB unaccounted=${s.unaccountedMB}MB ` +
      `uptime=${s.uptimeSeconds}s`
  );
}

function startMemoryLogging(intervalMs = 10 * 60 * 1000) {
  logSnapshot(); // baseline right at boot
  const timer = setInterval(logSnapshot, intervalMs);
  timer.unref();
  return timer;
}

module.exports = { snapshot, startMemoryLogging };
