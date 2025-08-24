# Project: Async Agents Example
Description: Minimal 8-file AI agents system for generating application code.
Dependencies:
- Node.js 18+
- TypeScript

## Project Structure
- src/index.ts
- src/index_seo.ts
- src/index_single_thread.ts
- src/utils/consts.ts
- src/worker_handoff.ts
- src/worker_roundrobin.ts
- src/worker_selector.ts
- src/worker_toolcall.ts
- src/worker_workflow.ts

---

## File: src/index.ts
```ts
import { Worker, BroadcastChannel } from "worker_threads";
import path from "path";
import { MAIN_CHANNEL } from "./utils/consts";
import { IContext, MODEL_INBOUND_ROLE, TYPE_NEW, END_USER_NAME, AGENT_MANAGER_NAME } from "async-agents-core";
const NUM_WORKERS = 3;
const WORK_PATH_STRING = './worker_roundrobin.js';
const workerPath = path.resolve(__dirname, WORK_PATH_STRING);
const workerChannels: BroadcastChannel[] = [];
let roundRobinIndex = 0;
function startWorker(id: number): void {
    const channelName = `worker-channel-${id}`;
    const worker = new Worker(workerPath, {
        workerData: { channel: channelName },
    });
    worker.on('error', err => {
        console.error(`Worker ${id} error:`, err);
    });
    worker.on('exit', code => {
        console.log(`Worker ${id} exited with code:`, code);
    });
    const channel = new BroadcastChannel(channelName);
    workerChannels.push(channel);
}
for (let i = 0; i < NUM_WORKERS; i++) {
    startWorker(i);
}
const mainChannel = new BroadcastChannel(MAIN_CHANNEL);
mainChannel.onmessage = (event: any) => {
    console.log("[Main] Got message from worker:", (event.data as IContext)?.messages
        ?.map(message => ({ ...message, modelMessage: message.modelMessage })));
};
function postToNextWorker(message: any) {
    const channel = workerChannels[roundRobinIndex];
    channel.postMessage(message);
    roundRobinIndex = (roundRobinIndex + 1) % workerChannels.length;
}
setTimeout(() => {
    const context: IContext = {
        messages: [
            {
                from: END_USER_NAME,
                to: AGENT_MANAGER_NAME,
                type: TYPE_NEW,
                createdAt: new Date().toISOString(),
                modelMessage: {
                    role: MODEL_INBOUND_ROLE,
                    content: 'Write a very short article about the impact of AI on society.'
                }
            }]
    };
    console.log("[Main] Sending:", context);
    postToNextWorker(context);
}, 3000);
```

## File: src/index_seo.ts
```ts
import { AgentManager, Agent, IContext, IClientSdk, ModelClient, getRound, END_USER_NAME, AGENT_MANAGER_NAME, TYPE_NEW, MODEL_INBOUND_ROLE, getMessages } from "async-agents-core";
import OpenAI from "openai";
import 'dotenv/config';
const baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const modelName = 'gemini-2.5-flash';
const main = async () => {
    try {
        const clientSdk: IClientSdk = new OpenAI({
            baseURL,
            apiKey: process.env.API_KEY
        });
        const shouldTerminate = (context: IContext, modelReplyText: string | undefined): boolean => {
            return modelReplyText?.toLowerCase().includes('terminate') || getRound(context) >= 5;
        }
        const manager = new AgentManager({
            shouldTerminate,
            modelClient: new ModelClient({ clientSdk, modelName }),
            debug: true
        });
        manager.register(new Agent({
            name: 'seo_analyst',
            onAfterSendingToModel: async (messages) => {
                console.log('seo_analyst messages:', messages);
            },
            modelClient: new ModelClient({ clientSdk, modelName }),
            systemMessage: `You are an SEO analyst. Analyze keywords, competition, and suggest topics for my-example-blogs.github.io.
            Provide:
            1. Primary keyword and secondary keywords
            2. Search volume estimates
            3. Content angle suggestions
            4. Competitor analysis
            5. The original request of the user`
        }));
        manager.register(new Agent({
            name: 'content_writer',
            onAfterSendingToModel: async (messages) => {
                console.log('content_writer messages:', messages);
            },
            modelClient: new ModelClient({ clientSdk, modelName }),
            systemMessage: `You are a content writer for my-example-blogs.github.io. Create engaging, SEO-friendly blog posts in markdown format.
            Guidelines:
            - Use headings with keywords
            - Write 300 - 500 words
            - Include internal links to other blog posts
            - Use bullet points and numbered lists
            - Add meta description
            Please follow the format used in below example: 
            ---
publishDate: 2025-08-23T01:00:00Z
title: Local LLMs for async agents framework development
excerpt: A local LLM is sufficient for testing async agents framework development
category: AI Models
tags:
  - ai models
metadata:
  canonical: https://my-example-blogs.github.io/blog/local-llms-for-async-agents-framework-development
---
# Local LLMs for Agent Development
For the core tasks of logic validation and tool-calling reliability xxxxxx\n
        `
        }));
        manager.register(new Agent({
            name: 'optimizer',
            onAfterSendingToModel: async (messages) => {
                console.log('optimizer messages:', messages);
            },
            modelClient: new ModelClient({ clientSdk, modelName }),
            systemMessage: `You are an SEO optimizer. Review and improve content for:
            - Keyword density and placement
            - Readability score
            - Meta tags optimization
            - Internal linking structure
            - Content freshness
            Say 'terminate' when optimization is complete.`
        }));
        const input: IContext = {
            messages: [{
                from: END_USER_NAME,
                to: AGENT_MANAGER_NAME,
                type: TYPE_NEW,
                createdAt: new Date().toISOString(),
                modelMessage: {
                    role: MODEL_INBOUND_ROLE,
                    content: 'Create an SEO-optimized blog post about React Performance Optimization Techniques'
                }
            }]
        };
        const output = await manager.handle(input);
        const finalContent = getMessages(output, 'optimizer')
            .filter(m => m.modelMessage.role === 'assistant')
            .pop()?.modelMessage.content;
        console.log('SEO-Optimized Blog Post:');
        console.log(finalContent);
    } catch (e) {
        console.error('Failed to generate SEO content:', e);
    }
}
main();
```

## File: src/index_single_thread.ts
```ts
import { AgentManager, Agent, IContext, IClientSdk, ModelClient, getRound, END_USER_NAME, AGENT_MANAGER_NAME, TYPE_NEW, MODEL_INBOUND_ROLE, getMessages } from "async-agents-core";
import OpenAI from "openai";
import 'dotenv/config';
const baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const modelName = 'gemini-2.5-flash';
const main = async () => {
    try {
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
                console.log('Manager messages:', messages);
            },
            debug: true
        });
        manager.register(new Agent({
            name: 'writer',
            onAfterSendingToModel: async (messages) => {
                console.log('Writer messages:', messages);
            },
            modelClient: new ModelClient({ clientSdk, modelName }),
            systemMessage: `You are a writer. Please write article. If there is feedback, do the rework.`
        }));
        manager.register(new Agent({
            name: 'reviewer',
            onAfterSendingToModel: async (messages) => {
                console.log('Reviewer messages:', messages);
            },
            modelClient: new ModelClient({ clientSdk, modelName }),
            systemMessage: `You are a reviewer. 
        Provide a very short improvement suggestion for the article. 
        If you think it is good enough, say: 'terminate'
        Please at least have two rounds of the reviews.
        If you think it is not good enough, provide a suggestion to improve the article`
        }));
        const input: IContext = {
            messages: [
                {
                    from: END_USER_NAME,
                    to: AGENT_MANAGER_NAME,
                    type: TYPE_NEW,
                    createdAt: new Date().toISOString(),
                    modelMessage: {
                        role: MODEL_INBOUND_ROLE,
                        content: 'Write a very short article about the impact of AI on society.'
                    }
                }]
        };
        const output = await manager.handle(input);
        const writerMessages = getMessages(output, 'writer');
        const writerLastmessage = writerMessages[writerMessages.length - 1];
        console.debug('Final Output: \n\n', writerLastmessage.modelMessage.content);
    } catch (e) {
        console.error(`Failed to start:`, e);
    }
}
main();
```

## File: src/utils/consts.ts
```ts
export const MAIN_CHANNEL = "main-channel";
```

## File: src/worker_handoff.ts
```ts
import { workerData } from "worker_threads";
import { AgentManager, Agent, IContext, IClientSdk, ModelClient, TOOL_CHOICE_AUTO, getAssignee, getRound } from "async-agents-core";
import { MAIN_CHANNEL } from "./utils/consts";
import OpenAI from "openai";
import 'dotenv/config';
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
```

## File: src/worker_roundrobin.ts
```ts
import { workerData } from "worker_threads";
import { AgentManager, Agent, IContext, IClientSdk, ModelClient, getRound } from "async-agents-core";
import { MAIN_CHANNEL } from "./utils/consts";
import OpenAI from "openai";
import 'dotenv/config';
const baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const modelName = 'gemini-2.5-flash';
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
```

## File: src/worker_selector.ts
```ts
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
```

## File: src/worker_toolcall.ts
```ts
import { workerData } from "worker_threads";
import { AgentManager, Agent, IContext, Handle, IClientSdk, ModelClient, ITool, TOOL_CHOICE_AUTO } from "async-agents-core";
import { MAIN_CHANNEL } from "./utils/consts";
import OpenAI from "openai";
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';
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
```

## File: src/worker_workflow.ts
```ts
import { workerData } from "worker_threads";
import { AgentManager, Agent, IContext, IClientSdk, ModelClient, getRound } from "async-agents-core";
import { MAIN_CHANNEL } from "./utils/consts";
import OpenAI from "openai";
import 'dotenv/config';
const baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const modelName = 'gemini-2.5-flash';
try {
    const mainChannel = new BroadcastChannel(MAIN_CHANNEL);
    const channelName: string = workerData.channel;
    const workerChannel = new BroadcastChannel(channelName);
    const clientSdk: IClientSdk = new OpenAI({
        baseURL,
        apiKey: process.env.API_KEY
    });
    const shouldTerminate = (context: IContext, modelReplyText: string | undefined): boolean => {
        return getRound(context) > 2;
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
        Provide a very short improvement suggestion for the article.`
    }));
    workerChannel.onmessage = async (event: any) => {
        const context = await manager.handle(event.data as IContext);
        mainChannel.postMessage(context);
    }
    console.debug(`[Worker] Started agentManager with channel "${workerData.channel}"`);
} catch (e) {
    console.error(`[Worker] Failed to start:`, e);
}
```
