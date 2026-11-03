import "server-only";

import {
  randomBytes,
  scrypt,
  scryptSync,
  timingSafeEqual,
  createHmac,
  createHash,
} from "node:crypto";

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_N = 4096;
const SCRYPT_N_LEGACY = 16384;

function scryptAsync(password: string, salt: string, keyLength: number, N: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, { N }, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey as Buffer);
    });
  });
}

function getPinPepper() {
  const pepper = process.env.LOGIN_PIN_PEPPER?.trim();

  if (!pepper) {
    throw new Error("Missing LOGIN_PIN_PEPPER.");
  }

  return pepper;
}

export function createPinLookup(pin: string) {
  return createHmac("sha256", getPinPepper()).update(pin).digest("hex");
}

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(`${pin}:${getPinPepper()}`, salt, SCRYPT_KEY_LENGTH, { N: SCRYPT_N });
  return `scrypt:${SCRYPT_N}:${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPinHash(pin: string, storedHash: string) {
  const parts = storedHash.split(":");

  let N: number;
  let salt: string;
  let expectedHex: string;

  if (parts.length === 4 && parts[0] === "scrypt") {
    // New format: scrypt:N:salt:hash
    N = parseInt(parts[1]!, 10);
    salt = parts[2]!;
    expectedHex = parts[3]!;
  } else if (parts.length === 3 && parts[0] === "scrypt") {
    // Legacy format: scrypt:salt:hash (N=16384)
    N = SCRYPT_N_LEGACY;
    salt = parts[1]!;
    expectedHex = parts[2]!;
  } else {
    return false;
  }

  if (!salt || !expectedHex || isNaN(N)) {
    return false;
  }

  const expected = Buffer.from(expectedHex, "hex");
  const actual = await scryptAsync(`${pin}:${getPinPepper()}`, salt, expected.length, N);

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

export function hashRequestIp(ip: string | null) {
  if (!ip) {
    return null;
  }

  return createHash("sha256").update(ip).digest("hex");
}
