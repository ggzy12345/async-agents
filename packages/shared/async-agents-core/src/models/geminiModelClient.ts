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

        // Convert messages to Gemini format
        const contents = messages.map(msg => ({
            role: msg.role === 'tool' ? 'model' : msg.role,
            parts: [{ text: msg.content || '' }]
        }));

        // Convert tools to Gemini format
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
        // Gemini returns function calls differently than OpenAI
        // This is a simplified example - you'll need to adjust based on actual response
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