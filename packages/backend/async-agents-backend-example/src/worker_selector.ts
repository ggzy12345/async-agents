import { workerData } from "worker_threads";
import { AgentManager, Agent, IContext, Handle, IClientSdk, ModelClient } from "async-agents-core";
import { MAIN_CHANNEL } from "./utils/consts";
import OpenAI from "openai";
import 'dotenv/config';

try {
    const mainChannel = new BroadcastChannel(MAIN_CHANNEL);
    const channelName: string = workerData.channel;
    const workerChannel = new BroadcastChannel(channelName);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const sleepHook: Handle = async (context) => {
        await sleep(10000);
        return context;
    };

    const clientSdk: IClientSdk = new OpenAI({
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        apiKey: process.env.API_KEY
    });

    const shouldTerminate = (context: IContext, modelReplyText: string | undefined): boolean => {
        return modelReplyText === 'terminate' || (context.round ?? 0) >= 10;
    }

    const manager = new AgentManager({
        shouldTerminate, beforeHooks: [sleepHook], modelClient: new ModelClient({ clientSdk, modelName: 'gemini-2.5-flash' }),
        onAfterSendingToModel: async (messages) => {
            console.log('[Worker] Selector messages:', messages);
        },
        selectorPrompt: `Select an agent to perform task.
        [writer, reviewer]
Read the above conversation, then select an agent from [writer, reviewer] to perform the next task.
Only select one agent.
Only say the agent, nothing else`,
        debug: true
    });

    manager.register(new Agent({
        name: 'writer',
        onAfterSendingToModel: async (messages) => {
            console.log('[Worker] Writer messages:', messages);
        },
        modelClient: new ModelClient({ clientSdk, modelName: 'gemini-2.5-flash' }),
        systemMessage: `You are a writer. Please write article. If there is feedback, do the rework.`
    }));
    manager.register(new Agent({
        name: 'reviewer',
        onAfterSendingToModel: async (messages) => {
            console.log('[Worker] Reviewer messages:', messages);
        },
        modelClient: new ModelClient({ clientSdk, modelName: 'gemini-2.5-flash' }),
        systemMessage: `You are a reviewer. 
        Provide a very short improvement suggestion for the article. 
        If you think it is good enough, say: terminate
        If you think it is not good enough, provide a suggestion to improve the article, `
    }));

    workerChannel.onmessage = async (event: any) => {
        const context = await manager.handle(event.data as IContext);
        mainChannel.postMessage(context);
    }

    console.debug(`[Worker] Started AgentManager with channel "${workerData.channel}"`);
} catch (e) {
    console.error(`[Worker] Failed to start:`, e);
}
