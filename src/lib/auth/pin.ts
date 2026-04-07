import "server-only";

import { randomBytes, scryptSync, timingSafeEqual, createHmac, createHash } from "node:crypto";

const SCRYPT_KEY_LENGTH = 64;

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
  const derivedKey = scryptSync(`${pin}:${getPinPepper()}`, salt, SCRYPT_KEY_LENGTH);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export function verifyPinHash(pin: string, storedHash: string) {
  const [algorithm, salt, expectedHex] = storedHash.split(":");

  if (algorithm !== "scrypt" || !salt || !expectedHex) {
    return false;
  }

  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(`${pin}:${getPinPepper()}`, salt, expected.length);

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
