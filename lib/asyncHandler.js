// Wraps an async Express route handler so a thrown error or rejected
// promise is forwarded to next(err) instead of becoming an unhandled
// promise rejection - which Node kills the whole process for by default,
// taking down every store hitting this one shared backend rather than
// just failing the one request. Express 4 only auto-catches synchronous
// throws, not async ones, so any `async (req, res) => {...}` handler
// needs this.
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
