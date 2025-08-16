import { Stream } from "openai/core/streaming";

export type Role = "user" | "assistant" | "system" | "tool";

export const MODEL_INBOUND_ROLE: Role = "user";
export const MODEL_OUTBOUND_ROLE: Role = "assistant";
export const SYSTEM_ROLE: Role = "system";
export const TOOL_ROLE: Role = "tool";


export interface IModelMessage {
    role: Role;
    content: string | undefined;
    tool_call_id?: string | undefined;
    tool_calls?: string | undefined;
    function_call?: { name: string; arguments: string };
    name?: string;
}

export interface IModelReply {
    content?: string;
    tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }>;
}

export interface IModelConfig {
    apiKey?: string;
    baseUrl?: string;
}

export type TOOL_CHOICE = "none" | "auto" | IToolChoice;
export const TOOL_CHOICE_NONE: TOOL_CHOICE = "none";
export const TOOL_CHOICE_AUTO: TOOL_CHOICE = "auto";

export interface IGenerateProps {
    messages: IModelMessage[];
    tools?: IToolDefinition[];
    tool_choice?: TOOL_CHOICE;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    stop?: string | string[];
    presence_penalty?: number;
    frequency_penalty?: number;
    [key: string]: any;
    stream?: boolean
}

export interface IModelClient {
    generate(props: IGenerateProps): Promise<IModelReply> | AsyncGenerator<string | IModelReply>;
    close?: () => Promise<void>;
}

export interface IClientSdk {
    chat: {
        completions: {
            create(
                params: any
            ): Promise<any>;

            create(
                params: any
            ): Promise<Stream<any>>;
        };
    };
}

export type HandleContent = (content: string) => Promise<string>;
export interface IModelClientProps {
    clientSdk: IClientSdk;
    modelName: string;
    replyHook?: HandleContent;
    preserveThinkTags?: boolean;
}

export interface IToolDefinition {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters: any; // Allow any to simplify, can be JSON Schema
    };
}

export interface ITool {
    name: string;
    description: string;
    parameters: object;  // JSON Schema object
    execute: (args: any) => Promise<any>;
}

export interface IToolChoice {
    type: "function";
    function: {
        name: string;
    };
}

