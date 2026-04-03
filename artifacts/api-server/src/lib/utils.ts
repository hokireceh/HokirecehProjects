import crypto from "crypto";

export function generatePassword(): string {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
