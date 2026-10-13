import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";

const calendarScope = "https://www.googleapis.com/auth/calendar.events";

export interface GoogleCalendarOptions {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  encryptionKey?: string;
}

function encryptionKey(value: string | undefined): Buffer {
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a 64-character hexadecimal key.");
  }
  return Buffer.from(value, "hex");
}

function encrypt(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decrypt(value: string, key: Buffer): string {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Stored Google token is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function ownerIdFrom(request: { headers: Record<string, unknown> }): string {
  return z.string().trim().min(1).parse(request.headers["x-owner-id"]);
}

function configured(options: GoogleCalendarOptions): boolean {
  return Boolean(options.clientId && options.clientSecret && options.redirectUri && options.encryptionKey);
}

type GoogleEvent = {
  id: string;
  summary?: string;
  htmlLink?: string;
  updated?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

async function accessToken(pool: Pool, ownerId: string, options: GoogleCalendarOptions): Promise<string> {
  const key = encryptionKey(options.encryptionKey);
  const result = await pool.query<{
    refresh_token: string;
    access_token: string | null;
    access_token_expires_at: Date | null;
  }>(
    `SELECT refresh_token, access_token, access_token_expires_at
     FROM google_calendar_connections WHERE owner_id = $1`,
    [ownerId],
  );
  const connection = result.rows[0];
  if (!connection) throw new Error("Google Calendar is not connected.");
  if (connection.access_token && connection.access_token_expires_at &&
      connection.access_token_expires_at.getTime() > Date.now() + 60_000) {
    return decrypt(connection.access_token, key);
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: options.clientId!,
      client_secret: options.clientSecret!,
      refresh_token: decrypt(connection.refresh_token, key),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error("Google access token refresh failed.");
  const token = z.object({ access_token: z.string(), expires_in: z.number() }).parse(await response.json());
  await pool.query(
    `UPDATE google_calendar_connections
     SET access_token = $1, access_token_expires_at = $2, updated_at = NOW()
     WHERE owner_id = $3`,
    [
      encrypt(token.access_token, key),
      new Date(Date.now() + token.expires_in * 1000),
      ownerId,
    ],
  );
  return token.access_token;
}

async function syncEvents(pool: Pool, ownerId: string, options: GoogleCalendarOptions): Promise<GoogleEvent[]> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
      timeMin: new Date().toISOString(),
      maxResults: "50",
      singleEvents: "true",
      orderBy: "startTime",
    })}`,
    { headers: { Authorization: `Bearer ${await accessToken(pool, ownerId, options)}` } },
  );
  if (!response.ok) throw new Error("Google Calendar event sync failed.");
  const payload = z.object({ items: z.array(z.object({
    id: z.string(),
    summary: z.string().optional(),
    htmlLink: z.string().optional(),
    updated: z.string().optional(),
    start: z.object({ dateTime: z.string().optional(), date: z.string().optional() }).optional(),
    end: z.object({ dateTime: z.string().optional(), date: z.string().optional() }).optional(),
  })) }).parse(await response.json());
  for (const event of payload.items) {
    await pool.query(
      `INSERT INTO google_calendar_events
        (owner_id, google_event_id, title, starts_at, ends_at, html_link, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
       ON CONFLICT (owner_id, google_event_id) DO UPDATE SET
         title = EXCLUDED.title, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
         html_link = EXCLUDED.html_link, updated_at = EXCLUDED.updated_at`,
      [
        ownerId,
        event.id,
        event.summary ?? "(Untitled event)",
        event.start?.dateTime ?? event.start?.date ?? null,
        event.end?.dateTime ?? event.end?.date ?? null,
        event.htmlLink ?? null,
        event.updated ?? null,
      ],
    );
  }

  return payload.items;
}

export async function updateLinkedGoogleEvent(
    pool: Pool,
    ownerId: string,
    activity: { id: string; title: string; description?: string; scheduledFor?: string },
    options: GoogleCalendarOptions,
  ): Promise<void> {
    const linked = await pool.query<{ google_event_id: string }>(
      `SELECT google_event_id FROM google_calendar_events
       WHERE owner_id = $1 AND activity_id = $2`,
      [ownerId, activity.id],
    );
    const eventId = linked.rows[0]?.google_event_id;
    if (!eventId) return;
    if (!activity.scheduledFor) {
      await deleteLinkedGoogleEvent(pool, ownerId, activity.id, options);
      return;
    }
    const start = new Date(activity.scheduledFor);
    const end = new Date(start.getTime() + 30 * 60_000);
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await accessToken(pool, ownerId, options)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: activity.title,
          description: activity.description ?? "Created by Loopify Owner Assistant.",
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        }),
      },
    );
    if (!response.ok) throw new Error("Google Calendar event update failed.");
    const event = z.object({ htmlLink: z.string().optional(), updated: z.string().optional() }).parse(await response.json());
    await pool.query(
      `UPDATE google_calendar_events
       SET title = $1, starts_at = $2, ends_at = $3, html_link = $4,
           updated_at = COALESCE($5, NOW())
       WHERE owner_id = $6 AND activity_id = $7`,
      [activity.title, start, end, event.htmlLink ?? null, event.updated ?? null, ownerId, activity.id],
    );
  }

  export async function deleteLinkedGoogleEvent(
    pool: Pool,
    ownerId: string,
    activityId: string,
    options: GoogleCalendarOptions,
  ): Promise<void> {
    const linked = await pool.query<{ google_event_id: string }>(
      `SELECT google_event_id FROM google_calendar_events
       WHERE owner_id = $1 AND activity_id = $2`,
      [ownerId, activityId],
    );
    const eventId = linked.rows[0]?.google_event_id;
    if (!eventId) return;
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${await accessToken(pool, ownerId, options)}` },
      },
    );
    if (!response.ok && response.status !== 404) throw new Error("Google Calendar event deletion failed.");
    await pool.query(
      "DELETE FROM google_calendar_events WHERE owner_id = $1 AND activity_id = $2",
      [ownerId, activityId],
    );
  }
export function registerGoogleCalendarRoutes(
  app: FastifyInstance,
  pool: Pool | undefined,
  options: GoogleCalendarOptions,
) {
  app.get("/calendar/status", async (request) => {
    if (!pool) return { configured: false, connected: false };
    const ownerId = ownerIdFrom(request);
    const result = await pool.query("SELECT 1 FROM google_calendar_connections WHERE owner_id = $1", [ownerId]);
    return { configured: configured(options), connected: result.rowCount === 1 };
  });

  app.get("/calendar/connect", async (request, reply) => {
    if (!pool || !configured(options)) {
      return reply.code(503).send({ error: "Google Calendar is not configured on this server." });
    }
    const ownerId = ownerIdFrom(request);
    const state = randomUUID();
    await pool.query(
      `INSERT INTO google_calendar_oauth_states (state, owner_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [state, ownerId],
    );
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: options.clientId!,
      redirect_uri: options.redirectUri!,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: calendarScope,
      state,
    }).toString();
    return { url: url.toString() };
  });

  app.get("/calendar/callback", async (request, reply) => {
    if (!pool || !configured(options)) return reply.code(503).send("Google Calendar is not configured.");
    const query = z.object({ code: z.string().min(1), state: z.string().uuid() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send("Invalid Google OAuth callback.");
    const stateResult = await pool.query<{ owner_id: string }>(
      `DELETE FROM google_calendar_oauth_states
       WHERE state = $1 AND expires_at > NOW()
       RETURNING owner_id`,
      [query.data.state],
    );
    const ownerId = stateResult.rows[0]?.owner_id;
    if (!ownerId) return reply.code(400).send("Google OAuth state is invalid or expired.");

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: query.data.code,
        client_id: options.clientId!,
        client_secret: options.clientSecret!,
        redirect_uri: options.redirectUri!,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) {
      return reply.code(502).send("Google did not approve the calendar connection.");
    }
    const token = z.object({
      access_token: z.string(),
      expires_in: z.number(),
      refresh_token: z.string().optional(),
    }).parse(await tokenResponse.json());
    const key = encryptionKey(options.encryptionKey);
    const now = new Date();
    const existing = await pool.query<{ refresh_token: string }>(
      "SELECT refresh_token FROM google_calendar_connections WHERE owner_id = $1",
      [ownerId],
    );
    const refreshToken = token.refresh_token
      ? encrypt(token.refresh_token, key)
      : existing.rows[0]?.refresh_token;
    if (!refreshToken) return reply.code(502).send("Google did not provide a refresh token. Try connecting again.");
    await pool.query(
      `INSERT INTO google_calendar_connections
        (owner_id, refresh_token, access_token, access_token_expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (owner_id) DO UPDATE SET
         refresh_token = EXCLUDED.refresh_token,
         access_token = EXCLUDED.access_token,
         access_token_expires_at = EXCLUDED.access_token_expires_at,
         updated_at = EXCLUDED.updated_at`,
      [
        ownerId,
        refreshToken,
        encrypt(token.access_token, key),
        new Date(now.getTime() + token.expires_in * 1000),
        now,
      ],
    );
    return reply.redirect(`${new URL("/mini-app/", options.redirectUri!).origin}/mini-app/?calendar=connected`);
  });

  app.delete("/calendar/connection", async (request, reply) => {
    if (!pool) return reply.code(503).send({ error: "Database is not configured." });
    await pool.query("DELETE FROM google_calendar_connections WHERE owner_id = $1", [ownerIdFrom(request)]);
    return { connected: false };
  });

  app.get("/calendar/events", async (request, reply) => {
    if (!pool || !configured(options)) return reply.code(503).send({ error: "Google Calendar is not configured." });
    try {
      const ownerId = ownerIdFrom(request);
      const events = await syncEvents(pool, ownerId, options);
      return events.map((event) => ({
        id: event.id,
        title: event.summary ?? "(Untitled event)",
        startsAt: event.start?.dateTime ?? event.start?.date ?? null,
        endsAt: event.end?.dateTime ?? event.end?.date ?? null,
        htmlLink: event.htmlLink ?? null,
      }));
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : "Calendar sync failed." });
    }
  });

  app.post("/calendar/events", async (request, reply) => {
    if (!pool || !configured(options)) return reply.code(503).send({ error: "Google Calendar is not configured." });
    const body = z.object({ activityId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "A valid activityId is required." });
    try {
      const ownerId = ownerIdFrom(request);
      const activityResult = await pool.query<{
        title: string;
        description: string | null;
        scheduled_for: Date | null;
      }>(
        `SELECT title, description, scheduled_for
         FROM activities WHERE owner_id = $1 AND id = $2`,
        [ownerId, body.data.activityId],
      );
      const activity = activityResult.rows[0];
      if (!activity) return reply.code(404).send({ error: "Activity not found." });
      if (!activity.scheduled_for) {
        return reply.code(400).send({ error: "Only scheduled activities can be added to Google Calendar." });
      }

      const existing = await pool.query<{ google_event_id: string; html_link: string | null }>(
        `SELECT google_event_id, html_link
         FROM google_calendar_events WHERE owner_id = $1 AND activity_id = $2`,
        [ownerId, body.data.activityId],
      );
      if (existing.rows[0]) {
        return { googleEventId: existing.rows[0].google_event_id, htmlLink: existing.rows[0].html_link };
      }

      const start = new Date(activity.scheduled_for);
      const end = new Date(start.getTime() + 30 * 60_000);
      const googleResponse = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await accessToken(pool, ownerId, options)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: activity.title,
          description: activity.description ?? "Created by Loopify Owner Assistant.",
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        }),
      });
      if (!googleResponse.ok) return reply.code(502).send({ error: "Google Calendar event creation failed." });
      const event = z.object({
        id: z.string(),
        htmlLink: z.string().optional(),
        updated: z.string().optional(),
      }).parse(await googleResponse.json());
      await pool.query(
        `INSERT INTO google_calendar_events
          (owner_id, activity_id, google_event_id, title, starts_at, ends_at, html_link, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))`,
        [
          ownerId,
          body.data.activityId,
          event.id,
          activity.title,
          start,
          end,
          event.htmlLink ?? null,
          event.updated ?? null,
        ],
      );
      return reply.code(201).send({ googleEventId: event.id, htmlLink: event.htmlLink ?? null });
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : "Calendar event creation failed." });
    }
  });

  app.patch("/calendar/events/:activityId", async (request, reply) => {
    if (!pool || !configured(options)) return reply.code(503).send({ error: "Google Calendar is not configured." });
    const params = z.object({ activityId: z.string().uuid() }).safeParse(request.params);
    const body = z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      scheduledFor: z.string().datetime({ offset: true }).optional(),
    }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid activity calendar data." });
    try {
      await updateLinkedGoogleEvent(pool, ownerIdFrom(request), {
        id: params.data.activityId,
        ...body.data,
      }, options);
      return { updated: true };
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : "Calendar update failed." });
    }
  });

  app.delete("/calendar/events/:activityId", async (request, reply) => {
    if (!pool || !configured(options)) return reply.code(503).send({ error: "Google Calendar is not configured." });
    const params = z.object({ activityId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid activity ID." });
    try {
      await deleteLinkedGoogleEvent(pool, ownerIdFrom(request), params.data.activityId, options);
      return { deleted: true };
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : "Calendar deletion failed." });
    }
  });
}

export { decrypt };
