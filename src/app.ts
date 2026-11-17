import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp.js";
import { requestLogging, type Log } from "./logging.js";
import { TicketStore } from "./tickets.js";

export function createApp({
  authenticate,
  logger,
  allowedHosts,
  store = new TicketStore(),
}: {
  authenticate: RequestHandler;
  logger: Log;
  allowedHosts: string[];
  store?: TicketStore;
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestLogging(logger));
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/mcp", authenticate);
  app.post("/mcp", express.json({ limit: "64kb" }), async (req, res, next) => {
    const server = createMcpServer(
      store,
      logger,
      res.locals.requestId as string,
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedHosts,
    });
    res.on("close", () => {
      void server.close().catch((error: unknown) =>
        logger({
          event: "transport_close_error",
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      next(error);
    }
  });
  app.all("/mcp", (_req, res) => {
    res.setHeader("Allow", "POST");
    res
      .status(405)
      .json({ error: "This stateless MCP endpoint supports POST only." });
  });
  const handleError: ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    next,
  ) => {
    const status =
      error instanceof SyntaxError
        ? 400
        : typeof error === "object" &&
            error !== null &&
            "type" in error &&
            error.type === "entity.too.large"
          ? 413
          : 500;
    logger({
      event: "http_error",
      request_id: res.locals.requestId,
      status,
      error_type: error instanceof Error ? error.name : "Unknown",
      error: status === 500 ? "Internal server error" : "Invalid request body",
    });
    if (res.headersSent) {
      next(error);
      return;
    }
    res.status(status).json({
      error:
        status === 500 ? "Internal server error." : "Invalid request body.",
    });
  };
  app.use(handleError);
  return app;
}
