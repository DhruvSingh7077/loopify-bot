import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("contacts API", () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = buildApp(); await app.ready(); });
  afterAll(async () => { await app.close(); });

  it("creates and searches contacts", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/contacts",
      headers: { "x-owner-id": "contacts-owner" },
      payload: { name: "Grace Medical", company: "Grace Services", relationship: "customer" },
    });
    expect(created.statusCode).toBe(201);
    const listed = await app.inject({
      method: "GET",
      url: "/contacts?search=grace",
      headers: { "x-owner-id": "contacts-owner" },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toHaveLength(1);
  });
});
