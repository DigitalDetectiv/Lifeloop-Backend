// Use this for any expected/handled failure (bad input, not found, auth
// failure) so the error middleware can tell it apart from a genuine bug
// and respond with the right status code + a clean message.
export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
