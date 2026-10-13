import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("activity API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates and lists activities for an owner", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/activities",
      headers: { "x-owner-id": "owner-api" },
      payload: {
        type: "meeting",
        title: "Client meeting",
        priority: "medium",
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const activity = createResponse.json();

    const listResponse = await app.inject({
      method: "GET",
      url: "/activities?status=pending",
      headers: { "x-owner-id": "owner-api" },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([activity]);
  });
});
