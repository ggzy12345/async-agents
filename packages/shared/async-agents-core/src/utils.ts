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