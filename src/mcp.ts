import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  addCommentSchema,
  createTicketSchema,
  TicketNotFoundError,
  TicketStore,
  ticketIdSchema,
  statusSchema,
  updateTicketSchema,
} from "./tickets.js";
import type { Log } from "./logging.js";

export function createMcpServer(
  store: TicketStore,
  logger: Log,
  requestId: string,
) {
  const server = new McpServer({
    name: "mock-support-tickets",
    version: "1.0.0",
  });
  const run = (tool: string, operation: () => Record<string, unknown>) => {
    try {
      const result = operation();
      logger({
        event: "mcp_tool",
        request_id: requestId,
        tool,
        outcome: "success",
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      if (!(error instanceof TicketNotFoundError)) throw error;
      logger({
        event: "mcp_tool",
        request_id: requestId,
        tool,
        outcome: "not_found",
      });
      return {
        isError: true,
        content: [{ type: "text" as const, text: error.message }],
      };
    }
  };
  const readOnly = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  const mutation = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  };

  server.registerTool(
    "list_tickets",
    {
      description:
        "List mock support tickets, optionally filtered by open, inprogress, or closed. Data is shared by demo users and resets on process restart.",
      inputSchema: z.object({ status: statusSchema.optional() }),
      annotations: readOnly,
    },
    ({ status }) =>
      run("list_tickets", () => ({ tickets: store.list(status) })),
  );
  server.registerTool(
    "get_ticket",
    {
      description: "Get a mock ticket including its comment history.",
      inputSchema: z.object({ ticket_id: ticketIdSchema }),
      annotations: readOnly,
    },
    ({ ticket_id }) =>
      run("get_ticket", () => ({ ticket: store.get(ticket_id) })),
  );
  server.registerTool(
    "create_ticket",
    {
      description:
        "Create a fictional support ticket in memory. All writes are ephemeral.",
      inputSchema: createTicketSchema,
      annotations: mutation,
    },
    (input) => run("create_ticket", () => ({ ticket: store.create(input) })),
  );
  server.registerTool(
    "update_ticket",
    {
      description:
        "Change a mock ticket's status, priority, or assignee. Use status closed to close a ticket.",
      inputSchema: updateTicketSchema.refine(
        (input) =>
          input.status !== undefined ||
          input.priority !== undefined ||
          input.assignee !== undefined,
        "Supply at least one change.",
      ),
      annotations: { ...mutation, idempotentHint: true },
    },
    (input) => run("update_ticket", () => ({ ticket: store.update(input) })),
  );
  server.registerTool(
    "add_comment",
    {
      description: "Append a fictional comment to a mock support ticket.",
      inputSchema: addCommentSchema,
      annotations: mutation,
    },
    (input) => run("add_comment", () => ({ ticket: store.addComment(input) })),
  );
  return server;
}
