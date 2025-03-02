import { z } from "zod";
import { eMCP } from "../src/index.js";

/**
 * eMCP includes an optional dedicated authentication handler
 * that can be used to authenticate requests
 */

const server = new eMCP("mcp-server-with-auth", "1.0.0", {
  authenticationHandler: async (request) => {
    // implement your custom auth logic here
    return true;
  },
});
console.log("Initializing mcp-server-with-auth...");

// Request to this tool, or any other resource or prompt will
// require authentication governed by the handler
server.addTool({
  name: "add",
  description: "Add two numbers",
  parameters: z.object({
    a: z.number(),
    b: z.number(),
  }),
  execute: async (args) => {
    server.logger.debug("Adding two numbers", args);
    return args.a + args.b;
  },
});
console.log("Added 'add' tool");

server.start({
  transportType: "sse",
  sse: {
    endpoint: "/sse",
    port: 8120,
  },
});
