import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import type { RequestHandler } from "express";
import { z } from "zod";
import { createApp } from "../src/app.js";
import { entraAuth } from "../src/auth.js";
import { sanitizeHeaders } from "../src/logging.js";

const ticketResult = z.object({
  ticket: z.object({
    id: z.string(),
    priority: z.string(),
    status: z.string(),
    assignee: z.string().nullable(),
    comments: z.array(z.object({ author: z.string(), text: z.string() })),
  }),
});
const listResult = z.object({ tickets: z.array(z.unknown()) });

async function start(
  authenticate: RequestHandler = (_req, _res, next) => next(),
) {
  const events: Record<string, unknown>[] = [];
  const allowedHosts: string[] = [];
  const server = createServer(
    createApp({
      authenticate,
      logger: (event) => events.push(event),
      allowedHosts,
    }),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  allowedHosts.push(`127.0.0.1:${address.port}`);
  return {
    endpoint: new URL(`http://127.0.0.1:${address.port}/mcp`),
    events,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

test("Streamable HTTP discovers tools and persists ticket mutations across independent requests", async () => {
  const service = await start();
  const client = new Client({ name: "integration-test", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(service.endpoint, {
        requestInit: {
          headers: {
            "x-demo-correlation-id": "test-flow",
            "x-api-key": "do-not-log",
          },
        },
      }),
    );
    assert.deepEqual(
      (await client.listTools()).tools.map((tool) => tool.name).sort(),
      [
        "add_comment",
        "create_ticket",
        "get_ticket",
        "list_tickets",
        "update_ticket",
      ],
    );
    for (const status of ["open", "inprogress", "closed"]) {
      const result = await client.callTool({
        name: "list_tickets",
        arguments: { status },
      });
      assert.equal(
        listResult.parse(result.structuredContent).tickets.length,
        1,
      );
    }
    const created = await client.callTool({
      name: "create_ticket",
      arguments: {
        title: "New demo",
        description: "Demo issue",
        requester: "Demo User",
      },
    });
    const ticket = ticketResult.parse(created.structuredContent).ticket;
    assert.equal(ticket.priority, "normal");
    const ticket_id = ticket.id;
    const updated = await client.callTool({
      name: "update_ticket",
      arguments: { ticket_id, status: "inprogress", assignee: "Demo Support" },
    });
    assert.ok(!updated.isError);
    await client.callTool({
      name: "add_comment",
      arguments: { ticket_id, author: "Demo User", text: "Testing" },
    });
    await client.callTool({
      name: "update_ticket",
      arguments: { ticket_id, status: "closed", priority: "urgent" },
    });
    const final = await client.callTool({
      name: "get_ticket",
      arguments: { ticket_id },
    });
    assert.deepEqual(ticketResult.parse(final.structuredContent).ticket, {
      id: ticket.id,
      status: "closed",
      priority: "urgent",
      assignee: "Demo Support",
      comments: [{ author: "Demo User", text: "Testing" }],
    });
    const missing = await client.callTool({
      name: "get_ticket",
      arguments: { ticket_id: "TKT-9999" },
    });
    assert.equal(missing.isError, true);
    for (const args of [{ ticket_id, status: "invalid" }, { ticket_id }]) {
      assert.equal(
        (await client.callTool({ name: "update_ticket", arguments: args }))
          .isError,
        true,
      );
    }
    assert.equal(
      (
        await client.callTool({
          name: "create_ticket",
          arguments: { title: " ", description: "demo", requester: "demo" },
        })
      ).isError,
      true,
    );
    assert.ok(
      service.events.some(
        (event) =>
          event.event === "http_header" &&
          event.name === "x-demo-correlation-id" &&
          event.value === "test-flow",
      ),
    );
    assert.ok(!JSON.stringify(service.events).includes("do-not-log"));
  } finally {
    await client.close();
    await service.close();
  }

  const restarted = await start();
  try {
    const response = await fetch(restarted.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(response.status, 200);
    // The restarted process has a fresh store, not the mutated prior instance.
    const freshClient = new Client({ name: "fresh-test", version: "1" });
    try {
      await freshClient.connect(
        new StreamableHTTPClientTransport(restarted.endpoint),
      );
      const fresh = await freshClient.callTool({
        name: "list_tickets",
        arguments: {},
      });
      assert.equal(listResult.parse(fresh.structuredContent).tickets.length, 3);
    } finally {
      await freshClient.close();
    }
  } finally {
    await restarted.close();
  }
});

test("headers preserve duplicates and redact credential-like names without logging query strings or bodies", async () => {
  const headers = sanitizeHeaders([
    "Authorization",
    "Bearer sensitive",
    "Cookie",
    "session=secret",
    "X-MS-Token-AAD-Access-Token",
    "secret",
    "X-Api-Key",
    "secret",
    "X-MS-Client-Principal",
    "secret",
    "X-Forwarded-For",
    "10.1.2.3",
    "X-Trace",
    "one",
    "X-Trace",
    "two",
    "X-Long",
    "x".repeat(3000),
  ]);
  assert.ok(
    headers
      .slice(0, 5)
      .every((header) => header.redacted && header.value === "[REDACTED]"),
  );
  assert.deepEqual(
    headers
      .filter((header) => header.name === "X-Trace")
      .map((header) => header.value),
    ["one", "two"],
  );
  assert.equal(headers.at(-1)?.value.length, 2048);
  assert.equal(headers.at(-1)?.truncated, true);
  const service = await start();
  try {
    await fetch(`${service.endpoint}?secret=query-secret`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"private":"body-secret"}',
    });
    assert.ok(!JSON.stringify(service.events).includes("query-secret"));
    assert.ok(!JSON.stringify(service.events).includes("body-secret"));
  } finally {
    await service.close();
  }
});

test("health checks are not logged, while MCP requests remain logged", async () => {
  const service = await start();
  try {
    const health = await fetch(
      new URL("/healthz?probe=readiness", service.endpoint),
    );
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    assert.ok(health.headers.get("x-request-id"));
    assert.equal(
      (
        await fetch(new URL("/HEALTHZ/", service.endpoint), {
          method: "HEAD",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(new URL("/healthz", service.endpoint), {
          method: "POST",
        })
      ).status,
      404,
    );
    assert.equal(service.events.length, 0);

    const mcp = await fetch(service.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "x-demo-correlation-id": "health-log-test",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(mcp.status, 200);
    const requestId = mcp.headers.get("x-request-id");
    const events = service.events.filter(
      (event) => event.request_id === requestId,
    );
    assert.ok(
      events.some(
        (event) => event.event === "http_request" && event.path === "/mcp",
      ),
    );
    assert.ok(
      events.some(
        (event) =>
          event.event === "http_header" &&
          event.name === "x-demo-correlation-id" &&
          event.value === "health-log-test",
      ),
    );
    assert.ok(
      events.some(
        (event) => event.event === "http_response" && event.status === 200,
      ),
    );

    assert.equal(
      (await fetch(new URL("/healthz-extra", service.endpoint))).status,
      404,
    );
    assert.ok(
      service.events.some(
        (event) =>
          event.event === "http_request" && event.path === "/healthz-extra",
      ),
    );
  } finally {
    await service.close();
  }
});

test("Entra validates signature, audience, issuer, expiration, tenant, client and delegated scope", async () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const audience = "22222222-2222-4222-8222-222222222222";
  const allowedClientId = "33333333-3333-4333-8333-333333333333";
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const key = createLocalJWKSet({
    keys: [{ ...(await exportJWK(publicKey)), kid: "test", alg: "RS256" }],
  });
  const service = await start(
    entraAuth({ tenantId, audience, allowedClientId }, () => {}, key),
  );
  const sign = (
    claims: Record<string, unknown> = {},
    signingKey = privateKey,
  ) =>
    new SignJWT({
      tid: tenantId,
      azp: allowedClientId,
      scp: "Tickets.ReadWrite",
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuedAt()
      .setSubject("demo-user")
      .setIssuer(
        typeof claims.iss === "string"
          ? claims.iss
          : `https://login.microsoftonline.com/${tenantId}/v2.0`,
      )
      .setAudience(typeof claims.aud === "string" ? claims.aud : audience)
      .setExpirationTime(typeof claims.exp === "number" ? claims.exp : "5m")
      .sign(signingKey);
  const invoke = async (token?: string) =>
    fetch(service.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
  try {
    assert.equal((await invoke()).status, 401);
    assert.equal((await invoke("not-a-jwt")).status, 401);
    assert.equal((await invoke(await sign())).status, 200);
    for (const claims of [
      { aud: "wrong-api" },
      { iss: "https://wrong-issuer.example" },
      { exp: Math.floor(Date.now() / 1000) - 60 },
    ])
      assert.equal((await invoke(await sign(claims))).status, 401);
    for (const claims of [
      { tid: "wrong-tenant" },
      { azp: "wrong-client" },
      { scp: "Other.Scope" },
      { scp: undefined, roles: ["Tickets.ReadWrite"] },
    ])
      assert.equal((await invoke(await sign(claims))).status, 403);
    const other = await generateKeyPair("RS256");
    assert.equal((await invoke(await sign({}, other.privateKey))).status, 401);
  } finally {
    await service.close();
  }
});

test("HTTP rejects malformed bodies, oversized payloads, untrusted hosts and unsupported methods", async () => {
  const service = await start();
  try {
    assert.equal(
      (
        await fetch(service.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(service.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: "x".repeat(66000) }),
        })
      ).status,
      413,
    );
    const invalidHostStatus = await new Promise<number | undefined>(
      (resolve, reject) => {
        const req = request(
          service.endpoint,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Host: "evil.example",
            },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        );
        req.on("error", reject);
        req.end("{}");
      },
    );
    assert.equal(invalidHostStatus, 403);
    assert.equal((await fetch(service.endpoint)).status, 405);
    assert.equal(
      (await fetch(service.endpoint, { method: "DELETE" })).status,
      405,
    );
    const health = new URL("/healthz", service.endpoint);
    assert.equal((await fetch(health)).status, 200);
  } finally {
    await service.close();
  }
});
