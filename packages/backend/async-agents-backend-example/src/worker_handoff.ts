import { workerData } from "worker_threads";
import { AgentManager, Agent, IContext, IClientSdk, ModelClient, TOOL_CHOICE_AUTO, getAssignee, getRound } from "async-agents-core";
import { MAIN_CHANNEL } from "./utils/consts";
import OpenAI from "openai";
import 'dotenv/config';
//const modelName = 'gemini-2.5-flash';
//const baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
//const modelName = "gemma-3n-e2b-it";
//const modelName = "qwen/qwen3-4b-2507";

const baseURL = 'http://192.168.68.109:1234/v1';
const modelName = "qwen/qwen3-1.7b";
try {
    const mainChannel = new BroadcastChannel(MAIN_CHANNEL);
    const channelName: string = workerData.channel;
    const workerChannel = new BroadcastChannel(channelName);
    const clientSdk: IClientSdk = new OpenAI({
        baseURL,
        apiKey: process.env.API_KEY
    });

    const shouldTerminate = (context: IContext, modelReplyText: string | undefined): boolean => {
        return modelReplyText?.trim()?.endsWith('terminate') || getRound(context) >= 6;
    }

    const manager = new AgentManager({
        shouldTerminate,
        onError: async (context, error) => {
            console.error(`[Worker] Error: `, error, context);
        },
    });

    manager.register(new Agent({
        name: 'Writer',
        onAfterSendingToModel: async (messages) => {
            console.log('[Worker] Writer messages:', messages);
        },
        handOffs: ['Reviewer'],
        handleHandOff: async (context, nextAgent) => {
            const assignee = getAssignee(context);
            console.log('[Worker] Writer message - ', assignee, ' handoff to', nextAgent);
            return nextAgent;
        },
        toolChoice: TOOL_CHOICE_AUTO,
        modelClient: new ModelClient({
            clientSdk, modelName
        }),
        systemMessage: `/no_think You are a writer. Please write article.`
    }));

    manager.register(new Agent({
        name: 'Reviewer',
        onAfterSendingToModel: async (messages) => {
            console.log('[Worker] Reviewer messages:', messages);
        },
        handOffs: ['Writer'],
        handleHandOff: async (context, nextAgent) => {
            const assignee = getAssignee(context);
            console.log('[Worker] Reviewer message - ', assignee, ' handoff to', nextAgent);
            return nextAgent;
        },
        toolChoice: TOOL_CHOICE_AUTO,
        modelClient: new ModelClient({
            clientSdk, modelName
        }),
        systemMessage: `/no_think You are a reviewer. 
        Provide a very short improvement suggestion for the article. 
        If you think it is not good enough, provide a suggestion to improve the article.
        `
    }));

    workerChannel.onmessage = async (event: any) => {
        const context = await manager.handle(event.data as IContext);
        mainChannel.postMessage(context);
    }

    console.debug(`[Worker] Started agentManager with channel "${workerData.channel}"`);
} catch (e) {
    console.error(`[Worker] Failed to start:`, e);
}
