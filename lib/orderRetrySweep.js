// Periodic background retry for orders whose email delivery is still
// "retrying" after orderDelivery.js's fast in-request attempts (0s, +5s,
// +30s) were exhausted - covers a longer SMTP outage than a customer
// would ever stand at the kiosk waiting for, without leaving the order
// silently stuck. Started once from server.js.

const { readOrders } = require("./ordersStore");
const { MAX_TOTAL_ATTEMPTS, retrySweepOrder } = require("./orderDelivery");

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

async function sweepOnce() {
  const candidates = readOrders().filter(
    (o) => o.emailStatus === "retrying" && (o.emailAttempts || 0) < MAX_TOTAL_ATTEMPTS
  );
  for (const order of candidates) {
    try {
      await retrySweepOrder(order);
    } catch (err) {
      console.error(`[retry-sweep] unexpected error retrying ${order.referenceId}:`, err);
    }
  }
}

function startRetrySweep() {
  const timer = setInterval(() => {
    sweepOnce().catch((err) => console.error("[retry-sweep] sweep pass failed:", err));
  }, SWEEP_INTERVAL_MS);
  // Don't let this recurring timer keep the process alive on its own.
  timer.unref();
  return timer;
}

module.exports = { startRetrySweep, sweepOnce };
