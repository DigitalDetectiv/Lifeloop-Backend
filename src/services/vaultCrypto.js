import crypto from 'node:crypto';

// Basic vault, by design (see product decision in the frontend): this is
// for low-sensitivity logins only, not a hardened zero-knowledge vault.
// The server holds the encryption key and can decrypt on the user's
// behalf when they click "Show" - that's the intentional trade-off for
// something simple, not a bug.

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const key = process.env.VAULT_ENCRYPTION_KEY;
  if (!key) throw new Error('VAULT_ENCRYPTION_KEY is not set');
  const buf = Buffer.from(key, 'base64');
  if (buf.length !== 32) throw new Error('VAULT_ENCRYPTION_KEY must decode to exactly 32 bytes');
  return buf;
}

export function encryptPassword(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedPassword: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

export function decryptPassword({ encryptedPassword, iv, authTag }) {
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPassword, 'base64')),
    decipher.final()
  ]);
  return decrypted.toString('utf-8');
}
