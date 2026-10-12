import { verifyAccessToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new ApiError(401, 'Missing or malformed Authorization header'));
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired access token'));
  }
}
