import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const terraformDirectory = fileURLToPath(
  new URL("../terraform", import.meta.url),
);
const output = JSON.parse(
  execFileSync(
    "terraform",
    [`-chdir=${terraformDirectory}`, "output", "-json"],
    { encoding: "utf8" },
  ),
);
const settings = z
  .object({
    tenant_id: z.uuid(),
    client_id: z.uuid(),
    resource_url: z.string().startsWith("api://"),
    scope: z.string(),
    authorization_url: z.url(),
    token_url: z.url(),
  })
  .parse(output.connector_settings.value);
const endpoint = new URL(z.url().parse(output.mcp_endpoint.value));
const swagger = {
  swagger: "2.0",
  info: {
    title: "Private mock support tickets",
    description:
      "Private Streamable HTTP MCP support ticket demo. All ticket data is fictional and ephemeral.",
    version: "1.0.0",
  },
  host: endpoint.host,
  basePath: "/",
  schemes: ["https"],
  consumes: ["application/json"],
  produces: ["application/json"],
  paths: {
    "/mcp": {
      post: {
        summary: "Mock support ticket MCP server",
        description:
          "List, create, update and comment on fictional support tickets.",
        "x-ms-agentic-protocol": "mcp-streamable-1.0",
        operationId: "InvokeMCP",
        responses: { "200": { description: "MCP response" } },
      },
    },
  },
  securityDefinitions: {
    oauth2: {
      type: "oauth2",
      flow: "accessCode",
      authorizationUrl: settings.authorization_url,
      tokenUrl: settings.token_url,
      scopes: { [settings.scope]: "Read and write fictional support tickets" },
    },
  },
  security: [{ oauth2: [settings.scope] }],
};
const directory = fileURLToPath(new URL("../artifacts", import.meta.url));
mkdirSync(directory, { recursive: true });
writeFileSync(
  `${directory}/support-tickets.swagger.json`,
  `${JSON.stringify(swagger, null, 2)}\n`,
);
writeFileSync(
  `${directory}/connector-settings.json`,
  `${JSON.stringify(settings, null, 2)}\n`,
);
console.log(
  `Connector definition and nonsecret settings written to ${directory}.`,
);
