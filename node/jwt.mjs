import { createHmac, timingSafeEqual } from 'node:crypto';

// Helper to convert strings or objects to URL-safe Base64
const base64UrlEncode = (obj) => {
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

// Helper to decode Base64Url back into a string
const base64UrlDecode = (str) => {
  return Buffer.from(str, 'base64url').toString('utf8');
};

/**
 * Generate a native JWT
 * @param {Object} payloadData - Custom claims (e.g., userId)
 * @param {string} secret - Server secret key
 * @param {number} expiresInSeconds - Expiration time duration
 */
export const sign = (payloadData, secret, expiresInSeconds = 3600) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  
  const payload = {
    ...payloadData,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);

  // Generate the cryptographic signature
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

/**
 * Verify a native JWT
 * @param {string} token - The raw JWT string
 * @param {string} secret - Server secret key
 */
export const verify = (token, secret) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;

    // Recreate the signature to compare against the token's signature
    const expectedSignature = createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    // Prevent timing attacks using a constant-time comparison
    const isSignatureValid = timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isSignatureValid) return null;

    // Check payload details and expiration
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const currentTime = Math.floor(Date.now() / 1000);

    if (payload.exp && currentTime > payload.exp) {
      return null; // Token has expired
    }

    return payload;
  } catch (error) {
    return null; // Invalid structure or JSON parsing error
  }
};







const SECRET_KEY = 'your_super_secure_and_long_random_secret_string';
const userPayload = { userId: '12345', role: 'admin' };

// 1. Generate Token (Expires in 15 minutes)
const token = sign(userPayload, SECRET_KEY, 900);
console.log('Generated JWT:', token);

// 2. Verify Token
const decodedPayload = verify(token, SECRET_KEY);

if (decodedPayload) {
  console.log('Token is valid! User ID:', decodedPayload.userId);
} else {
  console.log('Authentication failed: Token is invalid or expired.');
}