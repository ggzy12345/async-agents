import { workerData } from "worker_threads";
import { AgentManager, Agent, IContext, IClientSdk, ModelClient, getRound } from "async-agents-core";
import { MAIN_CHANNEL } from "./utils/consts";
import OpenAI from "openai";
import 'dotenv/config';

const baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const modelName = 'gemini-2.5-flash';
//const baseURL = 'http://192.168.68.109:1234/v1';
//const modelName = "qwen/qwen3-1.7b";

try {
    const mainChannel = new BroadcastChannel(MAIN_CHANNEL);
    const channelName: string = workerData.channel;
    const workerChannel = new BroadcastChannel(channelName);

    const clientSdk: IClientSdk = new OpenAI({
        baseURL,
        apiKey: process.env.API_KEY
    });

    const shouldTerminate = (context: IContext, modelReplyText: string | undefined): boolean => {
        return modelReplyText === 'terminate' || getRound(context) >= 10;
    }

    const manager = new AgentManager({
        shouldTerminate,
        onAfterSendingToModel: async (messages) => {
            console.log('[Worker] Selector messages:', messages);
        },
        debug: true
    });

    manager.register(new Agent({
        name: 'writer',
        onAfterSendingToModel: async (messages) => {
            console.log('[Worker] Writer messages:', messages);
        },
        modelClient: new ModelClient({ clientSdk, modelName }),
        systemMessage: `You are a writer. Please write article. If there is feedback, do the rework.`
    }));
    manager.register(new Agent({
        name: 'reviewer',
        onAfterSendingToModel: async (messages) => {
            console.log('[Worker] Reviewer messages:', messages);
        },
        modelClient: new ModelClient({ clientSdk, modelName }),
        systemMessage: `You are a reviewer. 
        Provide a very short improvement suggestion for the article. 
        If you think it is good enough, say: terminate
        If you think it is not good enough, provide a suggestion to improve the article`
    }));

    workerChannel.onmessage = async (event: any) => {
        const context = await manager.handle(event.data as IContext);
        mainChannel.postMessage(context);
    }

    console.debug(`[Worker] Started agentManager with channel "${workerData.channel}"`);
} catch (e) {
    console.error(`[Worker] Failed to start:`, e);
}
