import { removeThinkTags } from "../utils";
import { IClientSdk, IModelClientProps, IModelClient, IModelReply, IGenerateProps, IModelMessage, IToolDefinition, TOOL_CHOICE, TOOL_CHOICE_NONE, TOOL_CHOICE_AUTO, HandleContent } from "./types";

export class ModelClient implements IModelClient {
    private clientSdk: IClientSdk;
    private modelName: string;
    private replyHook: HandleContent | undefined;
    private preserveThinkTags: boolean | undefined;

    constructor({ clientSdk, modelName, replyHook, preserveThinkTags }: IModelClientProps) {
        this.clientSdk = clientSdk;
        this.modelName = modelName;
        this.replyHook = replyHook;
        this.preserveThinkTags = preserveThinkTags;
    }

    generate({ messages, tools = [],
        tool_choice = TOOL_CHOICE_NONE,
        stream = false }: IGenerateProps): Promise<IModelReply> | AsyncGenerator<string> {
        if (stream) {
            return this.streamCompletion(messages, tools, tool_choice);
        }
        return this.clientSdk.chat.completions.create({
            model: this.modelName,
            messages,
            tools,
            tool_choice,
        }).then(async response => {
            const replyContent = response.choices?.[0]?.message?.content ?? "";
            const content = this.preserveThinkTags ? replyContent : removeThinkTags(replyContent);
            return {
                content: await this.replyHook?.(content) ?? content,
                tool_calls: response.choices?.[0]?.message?.tool_calls
            };
        });
    }

    private async *streamCompletion(messages: IModelMessage[], tools: IToolDefinition[], tool_choice: TOOL_CHOICE): AsyncGenerator<string> {
        const stream = await this.clientSdk.chat.completions.create({
            model: this.modelName,
            messages,
            tools,
            tool_choice,
            stream: true,
        });

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) yield delta;
        }
    }

    close?: (() => Promise<void>) | undefined;
}
