import { z } from "zod";
import { eMCP } from "../src/index.js";

// Can be used in the same ways as LiteMCP
const server = new eMCP("basic-mcp-server", "1.0.0");
console.log("Initializing basic-mcp-server...");

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

server.addResource({
  uri: "file:///logs/app.log",
  name: "Application Logs",
  mimeType: "text/plain",
  async load() {
    return {
      text: "Example log content",
    };
  },
});
console.log("Added 'Application Logs' resource");

server.addPrompt({
  name: "git-commit",
  description: "Generate a Git commit message",
  arguments: [
    {
      name: "changes",
      description: "Git diff or description of changes",
      required: true,
    },
  ],
  load: async (args) => {
    return `Generate a concise but descriptive commit message for these changes:\n\n${args.changes}`;
  },
});
console.log("Added 'git-commit' prompt");

server.start();
