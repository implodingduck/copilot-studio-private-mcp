import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export type Log = (event: Record<string, unknown>) => void;
export const log: Log = (event) => {
  console.log(
    JSON.stringify({ timestamp: new Date().toISOString(), ...event }),
  );
};

const sensitiveHeader =
  /authorization|cookie|token|key|secret|credential|assertion|signature|certificate|client-cert|client-principal/i;

export function sanitizeHeaders(rawHeaders: string[]) {
  const headers: {
    name: string;
    value: string;
    redacted: boolean;
    truncated: boolean;
  }[] = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index] ?? "";
    const value = rawHeaders[index + 1] ?? "";
    const redacted = sensitiveHeader.test(name);
    headers.push({
      name,
      value: redacted ? "[REDACTED]" : value.slice(0, 2048),
      redacted,
      truncated: !redacted && value.length > 2048,
    });
  }
  return headers;
}

export function requestLogging(logger: Log): RequestHandler {
  return (req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    if (/^\/healthz\/?$/i.test(req.path)) {
      next();
      return;
    }
    const started = performance.now();
    logger({
      event: "http_request",
      request_id: requestId,
      method: req.method,
      path: req.path,
      remote_address: req.socket.remoteAddress,
      http_version: req.httpVersion,
    });
    // Separate events keep large header sets below Container Apps' per-line limit.
    for (const header of sanitizeHeaders(req.rawHeaders)) {
      logger({ event: "http_header", request_id: requestId, ...header });
    }
    res.on("finish", () =>
      logger({
        event: "http_response",
        request_id: requestId,
        status: res.statusCode,
        duration_ms: Math.round(performance.now() - started),
      }),
    );
    next();
  };
}
