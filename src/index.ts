import { createServer } from "node:http";
import type { RequestHandler } from "express";
import { createApp } from "./app.js";
import { entraAuth } from "./auth.js";
import { log } from "./logging.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "8080");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be 1-65535.");
const mode = process.env.AUTH_MODE ?? "entra";
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
let authenticate: RequestHandler;
if (mode === "none" && host === "127.0.0.1") {
  log({ event: "local_auth_disabled", host });
  authenticate = (_req, _res, next) => next();
} else if (mode === "entra") {
  authenticate = entraAuth(
    {
      tenantId: required("ENTRA_TENANT_ID"),
      audience: required("ENTRA_API_CLIENT_ID"),
      allowedClientId: required("ENTRA_CONNECTOR_CLIENT_ID"),
    },
    log,
  );
} else {
  throw new Error(
    "AUTH_MODE must be entra; none is permitted only with HOST=127.0.0.1.",
  );
}
const allowedHosts = required("ALLOWED_HOSTS")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (allowedHosts.length === 0)
  throw new Error("ALLOWED_HOSTS must contain at least one hostname.");
const server = createServer(
  { maxHeaderSize: 16384 },
  createApp({ authenticate, logger: log, allowedHosts }),
);
server.listen(port, host, () =>
  log({ event: "server_started", host, port, auth_mode: mode }),
);
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    log({ event: "server_stopping", signal });
    server.close((error) => {
      if (error) {
        log({ event: "shutdown_error", error: error.message });
        process.exitCode = 1;
      }
    });
    setTimeout(() => {
      server.closeAllConnections();
    }, 10000).unref();
  });
}
