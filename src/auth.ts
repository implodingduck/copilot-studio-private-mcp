import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import type { RequestHandler } from "express";
import type { Log } from "./logging.js";

export interface EntraConfig {
  tenantId: string;
  audience: string;
  allowedClientId: string;
}

export function entraAuth(
  config: EntraConfig,
  logger: Log,
  key?: JWTVerifyGetKey,
): RequestHandler {
  const issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
  const jwks =
    key ??
    createRemoteJWKSet(
      new URL(
        `https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`,
      ),
    );
  return async (req, res, next) => {
    const token = /^Bearer ([^\s]+)$/i.exec(
      req.headers.authorization ?? "",
    )?.[1];
    if (!token) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="support-tickets"');
      res.status(401).json({ error: "A bearer access token is required." });
      return;
    }
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: config.audience,
        algorithms: ["RS256"],
        requiredClaims: ["exp", "iat", "sub", "tid", "azp"],
      });
      if (
        payload.tid !== config.tenantId ||
        payload.azp !== config.allowedClientId ||
        typeof payload.scp !== "string" ||
        !payload.scp.split(" ").includes("Tickets.ReadWrite")
      ) {
        logger({
          event: "auth_denied",
          request_id: res.locals.requestId,
          reason: "insufficient_permission",
        });
        res.status(403).json({
          error:
            "The connector client and delegated Tickets.ReadWrite permission are required.",
        });
        return;
      }
      logger({
        event: "auth_success",
        request_id: res.locals.requestId,
        client_id: payload.azp,
        tenant_id: payload.tid,
      });
      next();
    } catch (error) {
      if (error instanceof errors.JOSEError) {
        logger({
          event: "auth_denied",
          request_id: res.locals.requestId,
          reason: error.code,
        });
        res.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
        res.status(401).json({ error: "Invalid or expired access token." });
        return;
      }
      next(error);
    }
  };
}
