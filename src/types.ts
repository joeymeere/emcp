import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

export type ToolParameters = z.ZodTypeAny;

export interface Tool<Params extends ToolParameters = ToolParameters> {
  name: string;
  description?: string;
  parameters?: Params;
  execute: (args: z.infer<Params>) => Promise<any>;
}

export interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  load: () => Promise<{ text: string } | { blob: string }>;
}

export type PromptArgument = Readonly<{
  name: string;
  description?: string;
  required?: boolean;
}>;

type ArgumentsToObject<T extends PromptArgument[]> = {
  [K in T[number]["name"]]: Extract<
    T[number],
    { name: K }
  >["required"] extends true
    ? string
    : string | undefined;
};

export interface Prompt<
  Arguments extends PromptArgument[] = PromptArgument[],
  Args = ArgumentsToObject<Arguments>,
> {
  name: string;
  description?: string;
  arguments?: Arguments;
  load: (args: Args) => Promise<string>;
}

export type MCPRequest = {
  headers?: Record<string, string>;
  params: Record<string, any>;
  method: string;
};

export type MCPResponse = {
  content?: any;
  error?: {
    code: number;
    message: string;
  };
};

export type NextFunction = () => Promise<MCPResponse>;

export type MiddlewareFunction = (
  request: MCPRequest,
  next: NextFunction,
) => Promise<MCPResponse>;

export type MiddlewareContext = {
  request: MCPRequest;
  response?: MCPResponse;
};

export type AuthenticationHandler = (request: {
  headers?: Record<string, string>;
}) => Promise<boolean> | boolean;

export const eMCPError = {
  ...ErrorCode,
  Unauthorized: 401,
} as const;
