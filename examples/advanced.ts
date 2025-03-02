import { eMCP } from "../src/index.js";
import { z } from "zod";

const server = new eMCP("advanced-example", "1.0.0");

server.addTool({
  name: "greet",
  description: "Greets a person",
  parameters: z.object({
    name: z.string(),
  }),
  execute: async (args) => {
    return `Hello ${args.name}!`;
  },
});

server.use(async (request, next) => {
  const startTime = Date.now();
  server.logger.debug("Request started", { method: request.method });

  const response = await next();

  const endTime = Date.now();
  server.logger.debug("Request completed", {
    method: request.method,
    duration: `${endTime - startTime}ms`,
  });

  return response;
});

server.use(async (request, next) => {
  const params = request.params;
  if (!params.lifecycle) {
    server.logger.debug("No lifecycle parameter found");
  } else {
    server.logger.debug("Lifecycle parameter found", params);
  }

  request.params.timestamp = new Date().toISOString();

  const response = await next();

  // Modify response with some metadata
  if (response.content) {
    response.content = {
      data: response.content,
      metadata: {
        processedAt: new Date().toISOString(),
      },
    };
  }

  return response;
});

server.start({
  transportType: "sse",
  sse: {
    endpoint: "/mcp",
    port: 3000,
  },
});
