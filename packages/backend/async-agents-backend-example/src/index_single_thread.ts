import { AgentManager, Agent, IContext, IClientSdk, ModelClient, getRound, END_USER_NAME, AGENT_MANAGER_NAME, TYPE_NEW, MODEL_INBOUND_ROLE, getMessages } from "async-agents-core";
import OpenAI from "openai";
import 'dotenv/config';

const baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const modelName = 'gemini-2.5-flash';
//const baseURL = 'http://192.168.68.109:1234/v1';
//const modelName = "qwen/qwen3-1.7b";

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

