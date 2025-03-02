import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { startSSEServer, type SSEServer } from "mcp-proxy";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  ServerCapabilities,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Logger } from "./logger.js";
import {
  AuthenticationHandler,
  eMCPError,
  MCPRequest,
  MCPResponse,
  MiddlewareContext,
  MiddlewareFunction,
  Prompt,
  PromptArgument,
  Resource,
  Tool,
  ToolParameters,
} from "./types.js";

export class eMCP {
  public logger: Logger;
  #tools: Tool[];
  #resources: Resource[];
  #prompts: Prompt[];
  #authHandler?: AuthenticationHandler;
  #middleware: MiddlewareFunction[] = [];

  constructor(
    public name: string,
    public version: string,
    options?: {
      authenticationHandler?: AuthenticationHandler;
    },
  ) {
    this.logger = new Logger();
    this.#tools = [];
    this.#resources = [];
    this.#prompts = [];

    if (this.#authHandler) {
      this.use(async (request, next) => {
        const isAuthenticated = await this.checkAuthentication(request);
        if (!isAuthenticated) {
          throw new McpError(
            eMCPError.Unauthorized,
            "Request authentication failed",
          );
        }
        return next();
      });
    }
  }

  public use(middleware: MiddlewareFunction) {
    this.#middleware.push(middleware);
  }

  private async executeMiddlewarePipeline(
    request: MCPRequest,
    handler: (request: MCPRequest) => Promise<MCPResponse>,
  ): Promise<MCPResponse> {
    const context: MiddlewareContext = {
      request,
    };

    const execute = async (index: number): Promise<MCPResponse> => {
      if (index === this.#middleware.length) {
        context.response = await handler(context.request);
        return context.response;
      }

      const nextMiddleware = this.#middleware[index];
      try {
        const response = await nextMiddleware(context.request, async () => {
          const result = await execute(index + 1);
          context.response = result;
          return result;
        });

        return response;
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          eMCPError.InternalError,
          `Middleware error: ${error}`,
        );
      }
    };

    return execute(0);
  }

  private async checkAuthentication(request: {
    headers?: Record<string, string>;
  }): Promise<boolean> {
    if (!this.#authHandler) {
      return true;
    }
    try {
      return await this.#authHandler(request);
    } catch (error) {
      console.error("[Authentication Error]", error);
      return false;
    }
  }

  private setupHandlers(server: Server) {
    const originalRequestHandler = server.setRequestHandler.bind(server);
    server.setRequestHandler = (schema: any, handler: any) => {
      return originalRequestHandler(schema, async (request: any) => {
        const mcpRequest: MCPRequest = {
          headers: request.headers,
          params: request.params,
          method: schema.name,
        };

        return this.executeMiddlewarePipeline(mcpRequest, async (req) => {
          return handler(req);
        });
      });
    };

    this.setupErrorHandling(server);
    if (this.#tools.length) {
      this.setupToolHandlers(server);
    }
    if (this.#resources.length) {
      this.setupResourceHandlers(server);
    }
    if (this.#prompts.length) {
      this.setupPromptHandlers(server);
    }
  }

  private setupErrorHandling(server: Server) {
    server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };
    process.on("SIGINT", async () => {
      await server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers(server: Server) {
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.#tools.map((tool) => {
          return {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.parameters
              ? zodToJsonSchema(tool.parameters)
              : undefined,
          };
        }),
      };
    });
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = this.#tools.find(
        (tool) => tool.name === request.params.name,
      );
      if (!tool) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`,
        );
      }
      let args: any = undefined;
      if (tool.parameters) {
        const parsed = tool.parameters.safeParse(request.params.arguments);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Invalid ${request.params.name} arguments`,
          );
        }
        args = parsed.data;
      }
      let result: any;
      try {
        result = await tool.execute(args);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
          isError: true,
        };
      }
      if (typeof result === "string") {
        return {
          content: [{ type: "text", text: result }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    });
  }

  private setupResourceHandlers(server: Server) {
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: this.#resources.map((resource) => {
          return {
            uri: resource.uri,
            name: resource.name,
            mimeType: resource.mimeType,
          };
        }),
      };
    });
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const resource = this.#resources.find(
        (resource) => resource.uri === request.params.uri,
      );
      if (!resource) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown resource: ${request.params.uri}`,
        );
      }
      let result: Awaited<ReturnType<Resource["load"]>>;
      try {
        result = await resource.load();
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Error reading resource: ${error}`,
          {
            uri: resource.uri,
          },
        );
      }
      return {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            ...result,
          },
        ],
      };
    });
  }

  private setupPromptHandlers(server: Server) {
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: this.#prompts.map((prompt) => {
          return {
            name: prompt.name,
            description: prompt.description,
            arguments: prompt.arguments,
          };
        }),
      };
    });
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const prompt = this.#prompts.find(
        (prompt) => prompt.name === request.params.name,
      );
      if (!prompt) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown prompt: ${request.params.name}`,
        );
      }
      const args = request.params.arguments;
      if (prompt.arguments) {
        for (const arg of prompt.arguments) {
          if (arg.required && !(args && arg.name in args)) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Missing required argument: ${arg.name}`,
            );
          }
        }
      }
      let result: Awaited<ReturnType<Prompt["load"]>>;
      try {
        result = await prompt.load(args as Record<string, string | undefined>);
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Error loading prompt: ${error}`,
        );
      }
      return {
        description: prompt.description,
        messages: [
          {
            role: "user",
            content: { type: "text", text: result },
          },
        ],
      };
    });
  }

  public addTool<Params extends ToolParameters>(tool: Tool<Params>) {
    this.#tools.push(tool as unknown as Tool);
  }

  public addResource(resource: Resource) {
    this.#resources.push(resource);
  }

  public addPrompt<const Args extends PromptArgument[]>(prompt: Prompt<Args>) {
    this.#prompts.push(prompt);
  }

  public async start(
    opts:
      | { transportType: "stdio" }
      | {
          transportType: "sse";
          sse: { endpoint: `/${string}`; port: number };
        } = {
      transportType: "stdio",
    },
  ) {
    const capabilities: ServerCapabilities = { logging: {} };
    if (this.#tools.length) {
      capabilities.tools = {};
    }
    if (this.#resources.length) {
      capabilities.resources = {};
    }
    if (this.#prompts.length) {
      capabilities.prompts = {};
    }
    const server = new Server(
      { name: this.name, version: this.version },
      { capabilities },
    );
    this.logger.setServer(server);
    this.setupHandlers(server);

    if (opts.transportType === "stdio") {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error(`${this.name} server running on stdio`);
    } else if (opts.transportType === "sse") {
      await startSSEServer({
        endpoint: opts.sse.endpoint as `/${string}`,
        port: opts.sse.port,
        createServer: async () => {
          return server;
        },
      });
      console.error(`${this.name} server running on SSE`);
    }
  }
}
