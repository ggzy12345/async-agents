# Project: Async Agents Example
Description: Minimal 8-file AI agents system for generating application code.
Dependencies:
- Node.js 18+
- TypeScript

## Project Structure
- src/index.ts
- src/agents/agent.ts
- src/utils.ts
- src/agentManager.ts
- src/agents/abstractAgent.ts
- src/models/geminiModelClient.ts
- src/models/modelClient.ts
- src/models/types.ts
- src/selectors/agentAssigneeSelector.ts
- src/selectors/managerAssigneeSelector.ts
- src/types/agentMessageHandler.ts
- src/types/agentRegister.ts
- src/types/types.ts

---

## File: src/index.ts
```ts
export * from './agents/abstractAgent';
export * from './agentManager';
export * from "./types/types";
export * from './agents/agent';
export * from './models/modelClient';
export * from './models/geminiModelClient'
export * from './models/types';
export * from './utils';
```

## File: src/agents/agent.ts
```ts
import {
    IModelClient,
    IModelMessage,
    ITool,
    MODEL_INBOUND_ROLE,
    MODEL_OUTBOUND_ROLE,
    SYSTEM_ROLE,
    TOOL_CHOICE,
    TOOL_CHOICE_AUTO,
    TOOL_ROLE
} from "../models/types";
import { AgentAssigneeSelector } from "../selectors/agentAssigneeSelector";
import { HandleHandOff, IAgentProps, IContext, SendingMessage } from "../types/types";
import { getMessages, isEmpty, replyMessage, sendMessage } from "../utils";
import { AbstractAgent } from "./abstractAgent";
export class Agent extends AbstractAgent {
    readonly onBeforeSendingToModel?: SendingMessage | undefined;
    readonly onAfterSendingToModel?: SendingMessage | undefined;
    readonly modelClient: IModelClient | undefined;
    private tools: ITool[];
    private toolChoice: TOOL_CHOICE | undefined;
    readonly systemMessage: string | undefined;
    readonly handleHandOff: HandleHandOff | undefined;
    private reflectionAfterToolCall: boolean | undefined;
    private assigneeSelector;
    constructor(props: IAgentProps) {
        super(props);
        this.onBeforeSendingToModel = props?.onBeforeSendingToModel;
        this.onAfterSendingToModel = props?.onAfterSendingToModel;
        this.modelClient = props?.modelClient;
        this.systemMessage = props?.systemMessage;
        this.handleHandOff = props?.handleHandOff;
        this.tools = props?.tools ?? [];
        this.toolChoice = props?.toolChoice;
        this.reflectionAfterToolCall = props?.reflectionAfterToolCall;
        this.assigneeSelector = new AgentAssigneeSelector(this,
            this.onBeforeSendingToModel,
            this.onAfterSendingToModel);
    }
    async handleMessages(
        context: IContext,
        from: string,
        messages: IModelMessage[]
    ): Promise<IContext> {
        let currentContext = context;
        if (!isEmpty(this.handOffs) || !isEmpty(this.tools)) {
            currentContext = await this.handleMessageWithTools(context, from, messages);
        } else {
            currentContext = await this.handleMessageWithoutTools(context, from, messages);
        }
        return currentContext;
    }
    private async handleMessageWithoutTools(
        context: IContext,
        from: string,
        messages: IModelMessage[]
    ): Promise<IContext> {
        let currentContext = context;
        const inputMessages = [
            { role: SYSTEM_ROLE, content: this.systemMessage },
        ].concat(messages);
        await this.onBeforeSendingToModel?.(inputMessages);
        const reply = await this.modelClient?.generate({ messages: inputMessages }) as any;
        const content = reply?.content;
        currentContext = this.saveMessage(
            context,
            {
                role: MODEL_OUTBOUND_ROLE, // inbound/outboud is always a pair. inbound only comes from manager
                content
            });
        currentContext = replyMessage(currentContext,
            this.name,
            from,
            {
                role: MODEL_INBOUND_ROLE,
                content: `[${this.name}]: ${content}`
            });
        await this.onAfterSendingToModel
            ?.(getMessages(currentContext, this.name)
                .map(message => message.modelMessage));
        return currentContext;
    }
    private async handleMessageWithTools(
        context: IContext,
        from: string,
        messages: IModelMessage[]
    ): Promise<IContext> {
        let currentContext = context;
        const inputMessages = [
            { role: SYSTEM_ROLE, content: this.systemMessage },
            ...messages
        ];
        const toolDefinitions = this.tools?.map(tool => ({
            type: "function" as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));
        await this.onBeforeSendingToModel?.(inputMessages);
        const initialResponse = await this.modelClient?.generate({
            messages: inputMessages,
            tools: toolDefinitions,
            tool_choice: this.toolChoice ?? TOOL_CHOICE_AUTO
        }) as any;
        this.debug && console.log('Model Response:', initialResponse);
        const initialResponseContent = initialResponse.content ?? '';
        let finalResponse: any;
        let toolResults: Array<Partial<IModelMessage>> = [];
        currentContext = this.saveMessage(
            currentContext,
            {
                role: MODEL_OUTBOUND_ROLE,
                content: initialResponseContent ?? '',
                tool_calls: initialResponse.tool_calls
            }
        );
        if (initialResponse.tool_calls?.length > 0) {
            for (const toolCall of initialResponse.tool_calls) {
                const tool = this.tools?.find(t => t.name === toolCall.function.name);
                let toolContent = '';
                if (!tool) {
                    toolContent = `Tool not found: ${toolCall.function.name}`;
                } else {
                    try {
                        const args = JSON.parse(toolCall.function.arguments);
                        const result = await tool.execute(args);
                        toolContent = JSON.stringify(result);
                    } catch (error) {
                        toolContent = `Error: ${(error as any).message || 'Tool execution failed'}`;
                    }
                }
                toolResults.push({
                    name: toolCall.function.name,
                    content: toolContent
                });
                currentContext = sendMessage(
                    currentContext,
                    `tool:${toolCall.function.name}`,
                    this.name,
                    {
                        role: TOOL_ROLE,
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
                        content: toolContent
                    }
                );
            }
            if (this.reflectionAfterToolCall) {
                await this.onBeforeSendingToModel?.(inputMessages);
                const responseAfterRefelction = await this.modelClient?.generate({
                    messages: inputMessages,
                    tool_choice: this.toolChoice ?? TOOL_CHOICE_AUTO,
                    tools: undefined
                }) as any;
                currentContext = this.saveMessage(
                    currentContext,
                    {
                        role: MODEL_OUTBOUND_ROLE,
                        content: responseAfterRefelction.content
                    }
                );
                finalResponse = {
                    content: initialResponseContent + '\n' + this.formatToolResults(toolResults) + '\n' + responseAfterRefelction.content
                };
                await this.onAfterSendingToModel
                    ?.(getMessages(currentContext, this.name)
                        .map(message => message.modelMessage));
            } else {
                finalResponse = {
                    content: initialResponseContent + '\n' + this.formatToolResults(toolResults)
                };
            }
        } else {
            finalResponse = initialResponse;
        }
        currentContext = replyMessage(
            currentContext,
            this.name,
            from,
            {
                role: MODEL_INBOUND_ROLE,
                content: `[${this.name}]: ${finalResponse.content}`
            }
        );
        await this.onAfterSendingToModel
            ?.(getMessages(currentContext, this.name)
                .map(message => message.modelMessage));
        return currentContext;
    }
    private formatToolResults(results: Array<Partial<IModelMessage>>): string {
        return results.map(result =>
            `[TOOL RESULT] ${result.name}: ${result.content}`
        ).join('\n');
    }
    public selectAssignee(context: IContext): Promise<IContext> {
        return this.assigneeSelector.handle(context);
    }
}
```

## File: src/utils.ts
```ts
import { IModelMessage } from "./models/types";
import { TYPE_NEW, IContext, AgentName, ReceiverName, SenderName, TYPE_FORWARD, TYPE_REPLY, IAgentMessage } from "./types/types";
const getLast = <T>(array: T[] | undefined): T | undefined => {
    if (isEmpty(array)) {
        return undefined;
    };
    return array?.[array?.length - 1];
};
export function isEmpty(value: unknown): boolean {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value as object).length === 0;
    return false;
}
export function removeThinkTags(content: string): string {
    return content.replace(/<think>[\s\S]{0,10000}?<\/think>/g, '').trim();
}
export function getRound(context: IContext) {
    return context.round ?? 0;
}
export const getAssignee = (context: IContext | undefined): AgentName | undefined => {
    return getLast(context?.assignees)?.name;
};
export const setAssignee = (context: IContext, assignee: AgentName): IContext => {
    return {
        ...context,
        assignees:
            (context.assignees ?? [])?.concat({
                name: assignee,
                assignedAt: new Date().toISOString()
            })
    };
};
export const sendMessage = (
    context: IContext,
    from: SenderName,
    to: ReceiverName,
    message: IModelMessage): IContext => {
    if (!message.role) {
        throw new Error('sendMessage: invalid message format');
    }
    const agentMessage = {
        from,
        to,
        type: TYPE_NEW,
        createdAt: new Date().toISOString(),
        modelMessage: message
    };
    return {
        ...context,
        messages: [...context.messages, agentMessage]
    }
};
export const replyMessage = (
    context: IContext,
    from: SenderName,
    to: ReceiverName,
    message: IModelMessage): IContext => {
    if (!message.role) {
        throw new Error('replyMessage: invalid message format');
    }
    const agentMessage = {
        from,
        to,
        type: TYPE_REPLY,
        createdAt: new Date().toISOString(),
        modelMessage: message
    };
    return {
        ...context,
        messages: [...context.messages, agentMessage]
    }
};
export const forwardMessage = (
    context: IContext,
    from: SenderName,
    to: ReceiverName | undefined,
    message: IModelMessage | undefined): IContext => {
    if (!message || !(message.role) || !to) {
        throw new Error('forwardMessage: invalid message format');
    }
    const agentMessage = {
        from,
        to,
        type: TYPE_FORWARD,
        createdAt: new Date().toISOString(),
        modelMessage: message
    };
    return {
        ...context,
        messages: [...context.messages, agentMessage]
    }
};
export const getMessages = (
    context: IContext,
    to: ReceiverName): IAgentMessage[] => {
    return context.messages.filter(message => message.to === to) ?? [];
};
export const getMessage = (
    context: IContext,
    to: ReceiverName): IAgentMessage | undefined => {
    return getLast(getMessages(context, to));
};
```

## File: src/agentManager.ts
```ts
import { AbstractAgent } from "./agents/abstractAgent";
import { COMPLETE, IContext, Handle, IAgentManagerProps, IHandler, INPROGRESS, AGENT_MANAGER_NAME, Predict, OnError, OnAgentMessage } from "./types/types";
import { forwardMessage, getAssignee, getMessage, isEmpty, setAssignee } from "./utils";
import { ManagerAssigneeSelector } from "./selectors/managerAssigneeSelector";
import { IAgentRegister } from "./types/agentRegister";
export class AgentManager implements IAgentRegister, IHandler {
    readonly name: string;
    readonly agents: AbstractAgent[] = [];
    private shouldTerminate: Predict;
    private assigneeSelector;
    private beforeHooks: Handle[];
    private afterHooks: Handle[];
    private onIncomingMessage: OnAgentMessage | undefined;
    private onError: OnError | undefined;
    private debug: boolean;
    constructor({
        shouldTerminate,
        selectorPrompt,
        modelClient,
        beforeHooks,
        afterHooks,
        onIncomingMessage,
        onBeforeSendingToModel,
        onAfterSendingToModel,
        onError,
        debug
    }: IAgentManagerProps) {
        this.name = AGENT_MANAGER_NAME;
        this.shouldTerminate = shouldTerminate;
        this.assigneeSelector = new ManagerAssigneeSelector(this,
            modelClient,
            selectorPrompt,
            onBeforeSendingToModel,
            onAfterSendingToModel);
        this.afterHooks = afterHooks ?? [];
        this.beforeHooks = beforeHooks ?? [];
        this.onIncomingMessage = onIncomingMessage;
        this.onError = onError;
        this.debug = debug ?? false;
    }
    public register(agent: AbstractAgent): void {
        agent.setManager(this);
        agent.setDebug(this.debug);
        this.agents.push(agent);
    }
    public async handle(context: IContext): Promise<IContext> {
        let currentContext = context;
        currentContext = {
            ...currentContext,
            state: INPROGRESS
        };
        let loopCount = currentContext.round ?? 0;
        while (currentContext && loopCount++ < 10) {
            try {
                currentContext = {
                    ...currentContext,
                    round: loopCount
                };
                for (const hook of this.beforeHooks) {
                    currentContext = await hook(currentContext);
                }
                if (currentContext.messages?.length >= 2) {
                    const modelReplyText = currentContext?.messages
                        ?.[currentContext.messages?.length - 2]
                        ?.modelMessage?.content;
                    if (this.shouldTerminate(currentContext, modelReplyText)) {
                        this.debug && console.debug(`Session COMPLETE"`);
                        return ({ ...currentContext, state: COMPLETE });
                    };
                }
                currentContext = await this.handleIncomingMessage(currentContext);
                for (const agent of this.agents) {
                    currentContext = await agent.handle(currentContext);
                }
                for (const hook of this.afterHooks) {
                    currentContext = await hook(currentContext);
                }
            } catch (error) {
                this.debug && console.error('Failed to handle message', currentContext, error);
                this.onError?.(currentContext, error);
                return currentContext;
            }
        }
        return currentContext;
    }
    private async handleIncomingMessage(context: IContext): Promise<IContext> {
        let currentContext = context
        const incomingMessage = getMessage(currentContext, this.name);
        await this.onIncomingMessage?.(incomingMessage);
        currentContext = await this.selectAssignee(context);
        currentContext = forwardMessage(currentContext, this.name, getAssignee(currentContext), incomingMessage?.modelMessage);
        return currentContext;
    }
    private async selectAssignee(context: IContext): Promise<IContext> {
        let currentContext = context;
        const agent = this.agents.find(agent => !isEmpty(agent.handOffs));
        if (agent) {
            if (!Boolean(getAssignee(currentContext))) { //for agent handoff, the first round has to hapen first
                currentContext = setAssignee(currentContext, this.agents[0].name);
            } else {
                const agent = this.agents.find(agent => agent.name === getAssignee(currentContext));
                if (!agent) {
                    throw new Error(`selectAssignee agent ${getAssignee(currentContext)} not found`);
                }
                currentContext = await agent.selectAssignee(currentContext);
            }
        } else {
            currentContext = await this.assigneeSelector.handle(currentContext);
        }
        return currentContext;
    }
}
```

## File: src/agents/abstractAgent.ts
```ts
import { IAgentProps, IContext, Handle, IHandler, ISupports, AgentName } from "../types/types";
import { getAssignee, getMessage, getMessages, sendMessage } from "../utils";
import { IAgentMessageHandler } from "../types/agentMessageHandler";
import { IModelMessage } from "../models/types";
import { AgentManager } from "../agentManager";
export abstract class AbstractAgent implements ISupports, IHandler, IAgentMessageHandler {
    public manager: AgentManager | undefined;
    readonly name: string;
    private beforeHooks: Handle[];
    private afterHooks: Handle[];
    readonly handOffs: AgentName[];
    public debug: boolean;
    constructor({ name, beforeHooks, afterHooks, handOffs }: IAgentProps) {
        this.name = name;
        this.beforeHooks = beforeHooks ?? [];
        this.afterHooks = afterHooks ?? [];
        this.handOffs = handOffs ?? [];
        this.debug = false;
    }
    public abstract handleMessages(
        context: IContext,
        from: string,
        messages: IModelMessage[]
    ): Promise<IContext>;
    public abstract selectAssignee(context: IContext): Promise<IContext>;
    public supports(context: IContext): boolean {
        return this.name === getAssignee(context);
    }
    public async handle(context: IContext): Promise<IContext> {
        if (!this.supports(context)) {
            return context;
        }
        let currentContext = context;
        for (const hook of this.beforeHooks) {
            currentContext = await hook(currentContext);
        }
        const message = getMessage(context, this.name);
        const messages = getMessages(context, this.name).map(message => message.modelMessage);
        currentContext = await this.handleMessages(context, message?.from ?? '', messages);
        for (const hook of this.afterHooks) {
            currentContext = await hook(currentContext);
        }
        return currentContext;
    }
    public setManager(manager: AgentManager): void {
        this.manager = manager
    }
    protected saveMessage(context: IContext, message: IModelMessage): IContext {
        return sendMessage(
            context,
            this.name,
            this.name,
            message
        )
    }
    public setDebug(debug: boolean) {
        this.debug = debug;
    }
}
```

## File: src/models/geminiModelClient.ts
```ts
import { IModelClient, IModelReply, IGenerateProps, IModelMessage, IToolDefinition, TOOL_CHOICE } from "./types";
export class GeminiModelClient implements IModelClient {
    private apiKey: string;
    private modelName: string;
    constructor({ apiKey, modelName }: { apiKey: string; modelName: string }) {
        this.apiKey = apiKey;
        this.modelName = modelName;
    }
    async generate({ messages, tools = [] }: IGenerateProps): Promise<IModelReply> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
        const contents = messages.map(msg => ({
            role: msg.role === 'tool' ? 'model' : msg.role,
            parts: [{ text: msg.content || '' }]
        }));
        const toolsConfig = tools.length > 0 ? {
            tools: tools.map(tool => ({
                functionDeclarations: [{
                    name: tool.function.name,
                    description: tool.function.description,
                    parameters: tool.function.parameters
                }]
            }))
        } : {};
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    temperature: 0.5,
                    maxOutputTokens: 2048
                },
                ...toolsConfig
            })
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${error}`);
        }
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const functionCalls = this.extractFunctionCalls(data);
        return {
            content: text,
            tool_calls: functionCalls
        };
    }
    private extractFunctionCalls(data: any): any[] | undefined {
        const functionCalls = data.candidates?.[0]?.content?.parts
            ?.filter((part: any) => part.functionCall)
            ?.map((part: any) => ({
                id: `call_${Math.random().toString(36).substr(2, 9)}`,
                type: 'function',
                function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args)
                }
            }));
        return functionCalls?.length > 0 ? functionCalls : undefined;
    }
    close?: (() => Promise<void>) | undefined;
}
```

## File: src/models/modelClient.ts
```ts
import { removeThinkTags } from "../utils";
import { IClientSdk, IModelClientProps, IModelClient, IModelReply, IGenerateProps, IModelMessage, IToolDefinition, TOOL_CHOICE, TOOL_CHOICE_NONE, TOOL_CHOICE_AUTO, HandleContent } from "./types";
export class ModelClient implements IModelClient {
    private clientSdk: IClientSdk;
    private modelName: string;
    private replyHook: HandleContent | undefined;
    private preserveThinkTags: boolean | undefined;
    constructor({ clientSdk, modelName, replyHook, preserveThinkTags }: IModelClientProps) {
        this.clientSdk = clientSdk;
        this.modelName = modelName;
        this.replyHook = replyHook;
        this.preserveThinkTags = preserveThinkTags;
    }
    generate({ messages, tools = [],
        tool_choice = TOOL_CHOICE_NONE,
        stream = false }: IGenerateProps): Promise<IModelReply> | AsyncGenerator<string> {
        if (stream) {
            return this.streamCompletion(messages, tools, tool_choice);
        }
        return this.clientSdk.chat.completions.create({
            model: this.modelName,
            messages,
            tools,
            tool_choice,
        }).then(async response => {
            const replyContent = response.choices?.[0]?.message?.content ?? "";
            const content = this.preserveThinkTags ? replyContent : removeThinkTags(replyContent);
            return {
                content: await this.replyHook?.(content) ?? content,
                tool_calls: response.choices?.[0]?.message?.tool_calls
            };
        });
    }
    private async *streamCompletion(messages: IModelMessage[], tools: IToolDefinition[], tool_choice: TOOL_CHOICE): AsyncGenerator<string> {
        const stream = await this.clientSdk.chat.completions.create({
            model: this.modelName,
            messages,
            tools,
            tool_choice,
            stream: true,
        });
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) yield delta;
        }
    }
    close?: (() => Promise<void>) | undefined;
}
```

## File: src/models/types.ts
```ts
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
            ): Promise<any>;
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
```

## File: src/selectors/agentAssigneeSelector.ts
```ts
import { Agent } from "../agents/agent";
import { ITool, MODEL_INBOUND_ROLE, SYSTEM_ROLE, TOOL_CHOICE_AUTO, TOOL_ROLE } from "../models/types";
import { IContext, IHandler, SendingMessage } from "../types/types";
import { getAssignee, getMessages, isEmpty, sendMessage, setAssignee } from "../utils";
export class AgentAssigneeSelector implements IHandler {
    constructor(
        private agent: Agent,
        readonly onBeforeSendingToModel?: SendingMessage | undefined,
        readonly onAfterSendingToModel?: SendingMessage | undefined,
    ) { }
    public async handle(context: IContext): Promise<IContext> {
        if (getAssignee(context) === this.agent.name && !isEmpty(this.agent.handOffs)) {
            return await this.getNewAssigneeFromModel(context);
        } else {
            return context;
        }
    }
    async getNewAssigneeFromModel(context: IContext): Promise<IContext> {
        let currentContext = context;
        const handoffTool: ITool = {
            name: "handoff",
            description: "Hand off conversation to another agent.",
            parameters: {
                type: "object",
                properties: {
                    nextAgent: {
                        type: "string",
                        description: "Name of agent to hand off to"
                    },
                },
                required: ["nextAgent"]
            },
            execute: async ({ nextAgent }) => {
                const agentName = await this.agent?.handleHandOff?.(context, nextAgent) ?? nextAgent;
                const agent = this.agent.manager?.agents.find(agent => agentName?.toLowerCase()?.includes(agent.name?.toLowerCase()));
                if (!agent) {
                    throw new Error(`Agent ${agentName} not found`);
                }
                return {
                    next_agent: agent.name,
                };
            },
        };
        const toolDefinitionsForHandOff = [handoffTool].map(tool => ({
            type: "function" as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));
        const handOffMessages = [
            {
                role: SYSTEM_ROLE, content: `${this.agent.systemMessage} \n 
                You can call [handoff] tool to handoff conversation to another agent. You only have one tool called [handoff] \n
            Please call [handoff] tool to hand off it to one of the BELOW agents: \n
            ${this.agent.handOffs.join('\n')}\n`
            },
            ...getMessages(currentContext, this.agent.name)
                .map(message => message.modelMessage).concat({
                    role: MODEL_INBOUND_ROLE,
                    content: `  Please call [handoff] tool to hand off it to one of the BELOW agents: \n
            ${this.agent.handOffs.join('\n')}\n`
                })
        ];
        currentContext = sendMessage(
            currentContext,
            this.agent.name,
            this.agent.name,
            {
                role: MODEL_INBOUND_ROLE,
                content: `  Please call [handoff] tool to hand off it to one of the BELOW agents: \n
            ${this.agent.handOffs.join('\n')}\n`
            }
        );
        await this.onBeforeSendingToModel?.(handOffMessages);
        const handOffResponse = await this.agent?.modelClient?.generate({
            messages: handOffMessages,
            tools: toolDefinitionsForHandOff,
            tool_choice: TOOL_CHOICE_AUTO
        }) as any;
        if (handOffResponse.tool_calls?.length <= 0) {
            throw new Error('No tool calls returned');
        }
        const toolCall = handOffResponse.tool_calls[0];
        const tool = handoffTool;
        let handOffContent = '';
        const args = JSON.parse(toolCall.function.arguments);
        const result = await tool.execute(args);
        handOffContent = `${handOffResponse.content}\n Handing off to ${result.next_agent}`;
        currentContext = sendMessage(
            currentContext,
            `tool:${toolCall.function.name}`,
            this.agent.name,
            {
                role: TOOL_ROLE,
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
                content: handOffContent
            }
        );
        await this.onAfterSendingToModel?.(getMessages(currentContext, this.agent.name)?.map(message => message.modelMessage));
        currentContext = setAssignee(context, result.next_agent);
        return currentContext;
    }
}
```

## File: src/selectors/managerAssigneeSelector.ts
```ts
import { AgentManager } from "../agentManager";
import { IModelClient, IModelMessage, MODEL_OUTBOUND_ROLE, SYSTEM_ROLE } from "../models/types";
import { IContext, IHandler, SendingMessage } from "../types/types";
import { getAssignee, getMessages, sendMessage, setAssignee } from "../utils";
export class ManagerAssigneeSelector implements IHandler {
    constructor(
        private manager: AgentManager,
        private modelClient: IModelClient | undefined,
        private selectorPrompt: string | undefined,
        readonly onBeforeSendingToModel?: SendingMessage | undefined,
        readonly onAfterSendingToModel?: SendingMessage | undefined,
    ) { }
    public async handle(context: IContext): Promise<IContext> {
        if (this.modelClient && this.selectorPrompt) {
            return await this.getNewAssigneeFromModel(context);
        } else { //round robin
            const agents = this.manager.agents;
            if (agents.length === 0) return context;
            const assignee = getAssignee(context);
            if (assignee) {
                const lastIndex = agents.findIndex(a => a.name === assignee);
                const nextIndex = (lastIndex + 1) % agents.length;
                return setAssignee(context, agents[nextIndex].name);
            } else {
                return setAssignee(context, agents[0].name);
            }
        }
    }
    async getNewAssigneeFromModel(context: IContext): Promise<IContext> {
        const incomingMessages = getMessages(context, this.manager.name)
            ?.map(message => message.modelMessage);
        const messages = [
            { role: SYSTEM_ROLE, content: this.selectorPrompt },
        ].concat(incomingMessages);
        let currentContext = context;
        await this.onBeforeSendingToModel?.(messages);
        const reply = await this.modelClient?.generate({ messages }) as any;
        const content = reply?.content;
        currentContext = this.saveMessage(context,
            {
                role: MODEL_OUTBOUND_ROLE, // inbound/outboud is always a pair. inbound comes from agent's reply and end user
                content
            });
        await this.onAfterSendingToModel?.(getMessages(currentContext, this.manager.name)?.map(message => message.modelMessage));
        return { ...currentContext, assignees: (currentContext.assignees ?? []).concat({ name: content, assignedAt: new Date().toISOString() }) };
    }
    protected saveMessage(context: IContext, message: IModelMessage): IContext {
        return sendMessage(
            context,
            this.manager.name,
            this.manager.name,
            message
        )
    }
}
```

## File: src/types/agentMessageHandler.ts
```ts
import { IModelMessage } from "../models/types";
import { IContext } from "./types";
export interface IAgentMessageHandler {
    handleMessages(
        context: IContext,
        from: string,
        messages: IModelMessage[]
    ): Promise<IContext>
}
```

## File: src/types/agentRegister.ts
```ts
import { AbstractAgent } from "../agents/abstractAgent";
export interface IAgentRegister {
    register(agent: AbstractAgent): void;
}
```

## File: src/types/types.ts
```ts
import { IModelClient, IModelMessage, ITool, TOOL_CHOICE } from "../models/types";
export type AgentName = string;
export type State = 'initial' | 'inprogress' | 'complete';
export const INITIAL: State = 'initial';
export const INPROGRESS: State = 'inprogress';
export const COMPLETE: State = 'complete';
export type EndUserName = 'endUser';
export type AgentManagerName = 'agentManager';
export const END_USER_NAME: EndUserName = 'endUser';
export const AGENT_MANAGER_NAME: AgentManagerName = 'agentManager';
export type SenderName = AgentManagerName | AgentName | EndUserName;
export type ReceiverName = AgentManagerName | AgentName;
export type AgentMessageType = 'new' | 'reply' | 'forward';
export const TYPE_NEW: AgentMessageType = 'new';
export const TYPE_REPLY: AgentMessageType = 'reply';
export const TYPE_FORWARD: AgentMessageType = 'forward';
export interface IAssignee {
    name: AgentName;
    assignedAt: string;
}
export interface IAgentMessage {
    from: SenderName,
    to: ReceiverName,
    type: AgentMessageType,
    createdAt: string,
    modelMessage: IModelMessage,
}
export interface IContext {
    state?: State;
    assignees?: IAssignee[];
    round?: number;
    messages: IAgentMessage[];
    metadata?: Record<string, any>;
    toolResults?: any;
}
export type OnAgentMessage = (message: IAgentMessage | undefined) => Promise<void>;
export type SendingMessage = (messages: IModelMessage[]) => Promise<void>;
export type Predict = (context: IContext, modelReplyText: string | undefined) => boolean;
export type HandleHandOff = (context: IContext, nextAgent: AgentName) => Promise<AgentName>;
export interface ISupports {
    supports(context: IContext): boolean;
}
export type Handle = (context: IContext) => Promise<IContext>;
export interface IHandler {
    handle(context: IContext): Promise<IContext>;
}
export interface IAgentProps {
    readonly name: string;
    readonly topics?: string[];
    readonly beforeHooks?: Handle[] | undefined;
    readonly afterHooks?: Handle[] | undefined;
    readonly modelClient?: IModelClient | undefined;
    readonly tools?: ITool[] | undefined;
    readonly toolChoice?: TOOL_CHOICE | undefined;
    readonly reflectionAfterToolCall?: boolean | undefined;
    readonly maxToolIterations?: number | undefined;
    readonly systemMessage?: string | undefined;
    readonly handOffs?: AgentName[] | undefined;
    readonly handleHandOff?: HandleHandOff | undefined;
    readonly onBeforeSendingToModel?: SendingMessage | undefined;
    readonly onAfterSendingToModel?: SendingMessage | undefined;
}
export type OnError = (context: IContext, error: any) => Promise<void>;
export interface IAgentManagerProps {
    readonly shouldTerminate: Predict;
    readonly onRelay?: Handle | undefined;
    readonly beforeHooks?: Handle[] | undefined;
    readonly afterHooks?: Handle[] | undefined;
    readonly modelClient?: IModelClient | undefined;
    readonly selectorPrompt?: string | undefined;
    readonly onBeforeSendingToModel?: SendingMessage | undefined;
    readonly onAfterSendingToModel?: SendingMessage | undefined;
    readonly onIncomingMessage?: OnAgentMessage | undefined;
    readonly onError?: OnError | undefined;
    readonly debug?: boolean;
}
```
