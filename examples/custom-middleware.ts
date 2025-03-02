import { z } from "zod";
import { eMCP } from "../src/index.js";

/**
 * In addition to the built-in auth handler, you can define your own middleware
 *
 * The examples below will:
 * - Time the entire req -> res cycle
 * - Log requests
 * - Check request headers
 *
 * Once finished with pre-processing, you can call `await next()` to get the response
 * and proceed with post-processing.
 *
 * Middlewares function like an onion, running before and after each request.
 *
 * In the case of the examples below, the order will go as follows:
 * ---- Request received ----
 * 1. Timer
 * 2. Logger
 * 3. Header checker
 * ---- Pre-processing done ----
 * 4. Core handler
 * ---- Post-processing start ----
 * 5. Header checker
 * 6. Logger
 * 7. Timer
 * ---- Response sent ----
 */

const server = new eMCP("mcp-server-with-middleware", "1.0.0", {
  authenticationHandler: async (request) => {
    // implement your custom auth logic here
    return true;
  },
});
console.log("Initializing mcp-server-with-middleware...");

// This will time entire req -> res cycle, including middlewares
server.use(async (request, next) => {
  const startTime = Date.now();
  server.logger.debug("Request started", { method: request.method });

  // Wait for all inner middleware and the handler to complete
  const response = await next();

  const endTime = Date.now();
  server.logger.debug("Request completed", {
    method: request.method,
    duration: `${endTime - startTime}ms`,
  });

  return response;
});
console.log("Registered 'Timer' middleware");

// This will log incoming requests
server.use(async (request, next) => {
  server.logger.debug("Request received", request);
  const response = await next();
  server.logger.debug("Response sent", response);
  return response;
});
console.log("Registered 'Logger' middleware");
// This will check request headers
server.use(async (request, next) => {
  const params = request.params;
  if (!params.lifecycle) {
    server.logger.debug("There's no lifecycle");
  } else {
    server.logger.debug("Lifecycle found", params);
  }
  const response = await next();
  server.logger.debug("We're about to send a response!");
  return response;
});
console.log("Registered 'Header checker' middleware");

// Middlewares will run before this tool is executed
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

server.start();
