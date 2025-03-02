# eMCP
<div>
  <img src="https://badgen.net/badge/version/1.0.0/orange">
  <a href="https://www.npmjs.com/package/emcp" target="_blank">
    <img src="https://img.shields.io/npm/v/emcp">
  </a>
</div>
<br>

A fork of the [LiteMCP](https://github.com/wong2/litemcp) TS library with extended features like built-in authentication handling, and custom middleware.

## Features

This is designed to be a near drop-in replacement for tools like LiteMCP. Because of this, all added features are currently optional.

- All current LiteMCP features
- Built-in authentication handler
- Custom layered middleware support

## Quickstart

### Basic Usage

Run the examples:

```bash
bun run example:basic
bun run example:auth
bun run example:middleware
bun run example:advanced
```

```ts
const server = new eMCP("mcp-server-with-auth", "1.0.0", {
  authenticationHandler: async (request) => {
    // implement your custom auth logic here
    return true;
  },
});

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
```

### Custom Middleware

```ts
const server = new eMCP("mcp-server-with-middleware", "1.0.0", {
  authenticationHandler: async (request) => {
    // implement your custom auth logic here
    return true;
  },
});

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
```

## How Middleware Works

Middleware in eMCP runs in order of registration. Once every middleware handler has hit it's `next()` block, then the standard MCP procedure will occur. Once the server is finished processing, then the order will run in reverse for middleware handlers with code after the `next()` block.

To put it simply, it looks something like this:

```
<---- Request received ----
1. Middleware 1
2. Middleware 2
<---- Pre-processing done ---->
4. Server handler
<---- Post-processing start ---->
5. Middleware 2
6. Middleware 1
---- Response sent ---->
```

If you're familiar with frameworks like Hono, then this will be familiar to you.

## Roadmap

- Ergonomic MCP<->MCP communication
- Integration into frameworks

## Why?

Because I felt like it
