
import { Agent } from "../agents/agent";
import { ITool, MODEL_INBOUND_ROLE, SYSTEM_ROLE, TOOL_CHOICE_AUTO, TOOL_ROLE } from "../models/types";
import { IContext, IHandler, SendingMessage } from "../types/types";
import { getAssignee, getMessages, isEmpty, sendMessage, setAssignee } from "../utils";

export class AgentAssigneeSelector implements IHandler {

    constructor(
        private agent: Agent,
        readonly onBeforeSendingToModel?: SendingMessage | undefined,
        readonly onAfterSendingToModel?: SendingMessage | undefined,
    ) { }

    public async handle(context: IContext): Promise<IContext> {

        if (getAssignee(context) === this.agent.name && !isEmpty(this.agent.handOffs)) {
            return await this.getNewAssigneeFromModel(context);
        } else {
            return context;
        }
    }

    async getNewAssigneeFromModel(context: IContext): Promise<IContext> {

        let currentContext = context;
        const handoffTool: ITool = {
            name: "handoff",
            description: "Hand off conversation to another agent.",
            parameters: {
                type: "object",
                properties: {
                    nextAgent: {
                        type: "string",
                        description: "Name of agent to hand off to"
                    },
                },
                required: ["nextAgent"]
            },
            execute: async ({ nextAgent }) => {
                const agentName = await this.agent?.handleHandOff?.(context, nextAgent) ?? nextAgent;
                const agent = this.agent.manager?.agents.find(agent => agentName?.toLowerCase()?.includes(agent.name?.toLowerCase()));
                if (!agent) {
                    throw new Error(`Agent ${agentName} not found`);
                }
                return {
                    next_agent: agent.name,
                };
            },
        };

        const toolDefinitionsForHandOff = [handoffTool].map(tool => ({
            type: "function" as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));

        const handOffMessages = [
            {
                role: SYSTEM_ROLE, content: `${this.agent.systemMessage} \n 
                You can call [handoff] tool to handoff conversation to another agent. You only have one tool called [handoff] \n
            Please call [handoff] tool to hand off it to one of the BELOW agents: \n
            ${this.agent.handOffs.join('\n')}\n`
            },
            ...getMessages(currentContext, this.agent.name)
                .map(message => message.modelMessage).concat({
                    role: MODEL_INBOUND_ROLE,
                    content: `  Please call [handoff] tool to hand off it to one of the BELOW agents: \n
            ${this.agent.handOffs.join('\n')}\n`
                })
        ];

        currentContext = sendMessage(
            currentContext,
            this.agent.name,
            this.agent.name,
            {
                role: MODEL_INBOUND_ROLE,
                content: `  Please call [handoff] tool to hand off it to one of the BELOW agents: \n
            ${this.agent.handOffs.join('\n')}\n`
            }
        );

        await this.onBeforeSendingToModel?.(handOffMessages);
        const handOffResponse = await this.agent?.modelClient?.generate({
            messages: handOffMessages,
            tools: toolDefinitionsForHandOff,
            tool_choice: TOOL_CHOICE_AUTO
        }) as any;

        if (handOffResponse.tool_calls?.length <= 0) {
            throw new Error('No tool calls returned');

        }
        const toolCall = handOffResponse.tool_calls[0];
        const tool = handoffTool;
        let handOffContent = '';
        const args = JSON.parse(toolCall.function.arguments);
        const result = await tool.execute(args);
        handOffContent = `${handOffResponse.content}\n Handing off to ${result.next_agent}`;

        currentContext = sendMessage(
            currentContext,
            `tool:${toolCall.function.name}`,
            this.agent.name,
            {
                role: TOOL_ROLE,
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
                content: handOffContent
            }
        );
        await this.onAfterSendingToModel?.(getMessages(currentContext, this.agent.name)?.map(message => message.modelMessage));
        currentContext = setAssignee(context, result.next_agent);
        return currentContext;
    }

}
