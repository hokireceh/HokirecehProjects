import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:";

function getKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY harus 32 bytes (64 karakter hex)");
  }
  return buf;
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return PREFIX + [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decrypt(value: string): string {
  if (!value) return value;
  if (!value.startsWith(PREFIX)) return value;

  const key = getKey();
  if (!key) {
    throw new Error("ENCRYPTION_KEY tidak diset — tidak bisa decrypt data");
  }

  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return value;

  const [ivHex, tagHex, encHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

