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

        // SEO Analyst Agent
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

        // Content Writer Agent
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

        // SEO Optimizer Agent
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