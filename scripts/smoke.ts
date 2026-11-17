import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

const endpoint = new URL(process.env.MCP_URL ?? "http://127.0.0.1:8080/mcp");
if (endpoint.protocol !== "https:" && endpoint.hostname !== "127.0.0.1") {
  throw new Error("Use HTTPS except for the local loopback demo.");
}
const token = process.env.MCP_BEARER_TOKEN;
const client = new Client({ name: "support-demo-smoke", version: "1.0.0" });
try {
  await client.connect(
    new StreamableHTTPClientTransport(endpoint, {
      requestInit: {
        headers: {
          "x-demo-correlation-id": `smoke-${Date.now()}`,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    }),
  );
  const { tools } = await client.listTools();
  assert.equal(tools.length, 5);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, `${name} returned a tool error.`);
    return result.structuredContent;
  };
  const created = z.object({ ticket: z.object({ id: z.string() }) }).parse(
    await call("create_ticket", {
      title: "Private connectivity demo",
      description: "Created through the MCP smoke test.",
      requester: "Demo User",
      priority: "normal",
    }),
  );
  const ticket_id = created.ticket.id;
  await call("update_ticket", {
    ticket_id,
    status: "inprogress",
    assignee: "Demo Support",
  });
  await call("add_comment", {
    ticket_id,
    author: "Demo User",
    text: "Private MCP connection verified.",
  });
  await call("update_ticket", { ticket_id, status: "closed" });
  const final = z
    .object({ ticket: z.object({ status: z.string() }) })
    .parse(await call("get_ticket", { ticket_id }));
  assert.equal(final.ticket.status, "closed");
  for (const status of ["open", "inprogress", "closed"])
    await call("list_tickets", { status });
  console.log(
    `MCP smoke test passed: ${ticket_id} created, updated, commented on, and closed.`,
  );
} finally {
  await client.close();
}
