import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default("127.0.0.1"),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  DATABASE_URL: z.string().url().optional(),
  TIME_ZONE: z.string().min(1).default("Asia/Kolkata"),
  MINI_APP_URL: z.string().url().default("http://localhost:3000/mini-app"),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
});

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return environmentSchema.parse(env);
}
