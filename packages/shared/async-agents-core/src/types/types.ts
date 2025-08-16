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

//1. EndUser (new) -> AgentManager(forward) -> Agent1
//2. Agent1(reply) -> AgentManager(forward) -> Agent2
//3. Agent2(reply) -> AgentManager(forward) -> Agent3
//4. Agent3(reply) -> AgentManager(reply) -> EndUser  
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
