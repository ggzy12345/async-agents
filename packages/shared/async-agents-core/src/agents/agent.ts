import {
    IModelClient,
    IModelMessage,
    ITool,
    MODEL_INBOUND_ROLE,
    MODEL_OUTBOUND_ROLE,
    SYSTEM_ROLE,
    TOOL_CHOICE,
    TOOL_CHOICE_AUTO,
    TOOL_ROLE
} from "../models/types";
import { AgentAssigneeSelector } from "../selectors/agentAssigneeSelector";
import { HandleHandOff, IAgentProps, IContext, SendingMessage } from "../types/types";
import { getMessages, isEmpty, replyMessage, sendMessage } from "../utils";
import { AbstractAgent } from "./abstractAgent";

export class Agent extends AbstractAgent {
    readonly onBeforeSendingToModel?: SendingMessage | undefined;
    readonly onAfterSendingToModel?: SendingMessage | undefined;
    readonly modelClient: IModelClient | undefined;
    private tools: ITool[];
    private toolChoice: TOOL_CHOICE | undefined;
    readonly systemMessage: string | undefined;
    readonly handleHandOff: HandleHandOff | undefined;
    private reflectionAfterToolCall: boolean | undefined;
    private assigneeSelector;

    constructor(props: IAgentProps) {
        super(props);
        this.onBeforeSendingToModel = props?.onBeforeSendingToModel;
        this.onAfterSendingToModel = props?.onAfterSendingToModel;
        this.modelClient = props?.modelClient;
        this.systemMessage = props?.systemMessage;
        this.handleHandOff = props?.handleHandOff;

        this.tools = props?.tools ?? [];
        this.toolChoice = props?.toolChoice;
        this.reflectionAfterToolCall = props?.reflectionAfterToolCall;

        this.assigneeSelector = new AgentAssigneeSelector(this,
            this.onBeforeSendingToModel,
            this.onAfterSendingToModel);
    }

    async handleMessages(
        context: IContext,
        from: string,
        messages: IModelMessage[]
    ): Promise<IContext> {

        let currentContext = context;
        if (!isEmpty(this.handOffs) || !isEmpty(this.tools)) {
            currentContext = await this.handleMessageWithTools(context, from, messages);
        } else {
            currentContext = await this.handleMessageWithoutTools(context, from, messages);
        }

        return currentContext;
    }

    private async handleMessageWithoutTools(
        context: IContext,
        from: string,
        messages: IModelMessage[]
    ): Promise<IContext> {
        let currentContext = context;

        const inputMessages = [
            { role: SYSTEM_ROLE, content: this.systemMessage },
        ].concat(messages);


        await this.onBeforeSendingToModel?.(inputMessages);

        const reply = await this.modelClient?.generate({ messages: inputMessages }) as any;
        const content = reply?.content;

        //send itself a copy as its history
        currentContext = this.saveMessage(
            context,
            {
                role: MODEL_OUTBOUND_ROLE, // inbound/outboud is always a pair. inbound only comes from manager
                content
            });

        //agent reply to manager as inbound
        currentContext = replyMessage(currentContext,
            this.name,
            from,
            {
                role: MODEL_INBOUND_ROLE,
                content: `[${this.name}]: ${content}`
            });

        await this.onAfterSendingToModel
            ?.(getMessages(currentContext, this.name)
                .map(message => message.modelMessage));

        return currentContext;
    }

    private async handleMessageWithTools(
        context: IContext,
        from: string,
        messages: IModelMessage[]
    ): Promise<IContext> {
        let currentContext = context;

        const inputMessages = [
            { role: SYSTEM_ROLE, content: this.systemMessage },
            ...messages
        ];

        const toolDefinitions = this.tools?.map(tool => ({
            type: "function" as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));

        await this.onBeforeSendingToModel?.(inputMessages);

        const initialResponse = await this.modelClient?.generate({
            messages: inputMessages,
            tools: toolDefinitions,
            tool_choice: this.toolChoice ?? TOOL_CHOICE_AUTO
        }) as any;
        this.debug && console.log('Model Response:', initialResponse);


        const initialResponseContent = initialResponse.content ?? '';
        let finalResponse: any;
        let toolResults: Array<Partial<IModelMessage>> = [];

        currentContext = this.saveMessage(
            currentContext,
            {
                role: MODEL_OUTBOUND_ROLE,
                content: initialResponseContent ?? '',
                tool_calls: initialResponse.tool_calls
            }
        );

        if (initialResponse.tool_calls?.length > 0) {

            for (const toolCall of initialResponse.tool_calls) {
                const tool = this.tools?.find(t => t.name === toolCall.function.name);
                let toolContent = '';

                if (!tool) {
                    toolContent = `Tool not found: ${toolCall.function.name}`;
                } else {
                    try {
                        const args = JSON.parse(toolCall.function.arguments);
                        const result = await tool.execute(args);
                        toolContent = JSON.stringify(result);
                    } catch (error) {
                        toolContent = `Error: ${(error as any).message || 'Tool execution failed'}`;
                    }
                }
                toolResults.push({
                    name: toolCall.function.name,
                    content: toolContent
                });
                currentContext = sendMessage(
                    currentContext,
                    `tool:${toolCall.function.name}`,
                    this.name,
                    {
                        role: TOOL_ROLE,
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
                        content: toolContent
                    }
                );
            }


            if (this.reflectionAfterToolCall) {
                await this.onBeforeSendingToModel?.(inputMessages);

                const responseAfterRefelction = await this.modelClient?.generate({
                    messages: inputMessages,
                    tool_choice: this.toolChoice ?? TOOL_CHOICE_AUTO,
                    tools: undefined
                }) as any;

                currentContext = this.saveMessage(
                    currentContext,
                    {
                        role: MODEL_OUTBOUND_ROLE,
                        content: responseAfterRefelction.content
                    }
                );
                finalResponse = {
                    content: initialResponseContent + '\n' + this.formatToolResults(toolResults) + '\n' + responseAfterRefelction.content
                };
                await this.onAfterSendingToModel
                    ?.(getMessages(currentContext, this.name)
                        .map(message => message.modelMessage));
            } else {
                finalResponse = {
                    content: initialResponseContent + '\n' + this.formatToolResults(toolResults)
                };
            }
        } else {
            finalResponse = initialResponse;
        }

        currentContext = replyMessage(
            currentContext,
            this.name,
            from,
            {
                role: MODEL_INBOUND_ROLE,
                content: `[${this.name}]: ${finalResponse.content}`
            }
        );

        await this.onAfterSendingToModel
            ?.(getMessages(currentContext, this.name)
                .map(message => message.modelMessage));

        return currentContext;
    }

    private formatToolResults(results: Array<Partial<IModelMessage>>): string {
        return results.map(result =>
            `[TOOL RESULT] ${result.name}: ${result.content}`
        ).join('\n');
    }

    public selectAssignee(context: IContext): Promise<IContext> {
        return this.assigneeSelector.handle(context);
    }

}