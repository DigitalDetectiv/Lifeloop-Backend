// Wraps an async route handler so thrown errors/rejections reach Express's
// error middleware automatically, instead of every controller needing its
// own try/catch.
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
