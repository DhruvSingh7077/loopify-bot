import { createHmac, timingSafeEqual } from "node:crypto";

const maxAuthAgeSeconds = 24 * 60 * 60;

export function verifyTelegramInitData(initData: string, botToken: string, now = Date.now()): string {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  const userJson = params.get("user");

  if (!receivedHash || !Number.isFinite(authDate) || !userJson) {
    throw new Error("Valid Telegram initialization data is required.");
  }
  if (now / 1000 - authDate > maxAuthAgeSeconds || authDate > now / 1000 + 60) {
    throw new Error("Telegram initialization data has expired.");
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const expected = Buffer.from(expectedHash, "hex");
  const received = Buffer.from(receivedHash, "hex");

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error("Telegram initialization data is invalid.");
  }

  const user = JSON.parse(userJson) as { id?: number };
  if (!Number.isInteger(user.id)) throw new Error("Telegram user identity is missing.");
  return String(user.id);
}
