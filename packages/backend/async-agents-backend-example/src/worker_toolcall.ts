import { workerData } from "worker_threads";
import { AgentManager, Agent, IContext, Handle, IClientSdk, ModelClient, ITool, TOOL_CHOICE_AUTO } from "async-agents-core";
import { MAIN_CHANNEL } from "./utils/consts";
import OpenAI from "openai";
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';

//const baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
//const modelName = 'gemini-2.5-flash';
const baseURL = 'http://192.168.68.109:1234/v1';
const modelName = "qwen/qwen3-1.7b";

const saveTool: ITool = {
    name: "save_to_file",
    description: "Save the content to a local Markdown file",
    parameters: {
        type: "object",
        properties: {
            file_path: {
                type: "string",
                description: "File path"
            },
            content: {
                type: "string",
                description: "content"
            },
        },
        required: ["file_path", "content"]
    },
    execute: async ({ file_path, content }) => {
        try {
            const normalizedPath = path.normalize(file_path);
            const dir = path.dirname(normalizedPath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(normalizedPath, content, 'utf8');

            return `Content successfully saved to file: ${normalizedPath}`;
        } catch (error) {
            const errorMessage = (error as Error).message || 'Unknown error';
            throw new Error(`Failed to save file: ${errorMessage}`);
        }
    }
};

try {
    const mainChannel = new BroadcastChannel(MAIN_CHANNEL);
    const channelName: string = workerData.channel;
    const workerChannel = new BroadcastChannel(channelName);
    const clientSdk: IClientSdk = new OpenAI({
        baseURL,
        apiKey: process.env.API_KEY
    });

    const shouldTerminate = (context: IContext, modelReplyText: string | undefined): boolean => {
        return modelReplyText?.trim()?.endsWith('terminate') || (context.round ?? 0) >= 16;
    }

    const manager = new AgentManager({
        shouldTerminate,
        onError: async (context, error) => {
            console.error(`[Worker] Error: `, error, context);
        },
    });

    const afterRoundHook: Handle = async (context) => {
        console.log(`Done round: ${context.round} Done by: ${context.assignees?.[context.assignees?.length - 1]?.name}`);
        return context;
    }
    manager.register(new Agent({
        name: 'Writer',
        afterHooks: [afterRoundHook],
        onAfterSendingToModel: async (messages) => {
            console.log('[Worker] Writer messages:', messages);
        },
        modelClient: new ModelClient({
            clientSdk, modelName
        }),
        systemMessage: `/no_think You are a writer. Please write article. 
        You work with Recorder to get the job done.
        If the Recorder called save_to_file, please only say: terminate
        `
    }));

    manager.register(new Agent({
        name: 'Recorder',
        onAfterSendingToModel: async (messages) => {
            console.log('[Worker] Recorder messages:', messages);
        },
        modelClient: new ModelClient({
            clientSdk,
            modelName
        }),
        tools: [saveTool],
        toolChoice: TOOL_CHOICE_AUTO,
        reflectionAfterToolCall: true,
        systemMessage: `/no_think You are the recorder. 
        When recieving message call save_to_file tool to save the content to a file.`
    }));
    workerChannel.onmessage = async (event: any) => {
        const context = await manager.handle(event.data as IContext);
        mainChannel.postMessage(context);
    }

    console.debug(`[Worker] Started agentManager with channel "${workerData.channel}"`);
} catch (e) {
    console.error(`[Worker] Failed to start:`, e);
}
