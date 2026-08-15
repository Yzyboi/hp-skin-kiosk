// Bounds how many expensive jobs (sharp compositing, PDF generation) run
// at once. Without this, a burst of orders arriving around the same
// moment across many stores would each spin up sharp/pdfkit work in full
// parallel, and peak memory would scale with however many stores happen
// to submit at the same instant instead of staying flat. Excess jobs wait
// in FIFO order instead of running unbounded in parallel.
function createLimiter(maxConcurrent) {
  let active = 0;
  const queue = [];

  function runNext() {
    if (active >= maxConcurrent || queue.length === 0) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    fn().then(
      (value) => {
        active -= 1;
        resolve(value);
        runNext();
      },
      (err) => {
        active -= 1;
        reject(err);
        runNext();
      }
    );
  }

  return function withLimit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      runNext();
    });
  };
}

module.exports = { createLimiter };
