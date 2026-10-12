import { ApiError } from '../utils/ApiError.js';

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Postgres unique-violation - translate into a friendlier 409.
  if (err.code === '23505') {
    return res.status(409).json({ error: 'That value is already in use.' });
  }

  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}
