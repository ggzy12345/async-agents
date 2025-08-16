
import { AgentManager } from "../agentManager";
import { IModelClient, IModelMessage, MODEL_OUTBOUND_ROLE, SYSTEM_ROLE } from "../models/types";
import { IContext, IHandler, SendingMessage } from "../types/types";
import { getAssignee, getMessages, sendMessage, setAssignee } from "../utils";

export class ManagerAssigneeSelector implements IHandler {

    constructor(
        private manager: AgentManager,
        private modelClient: IModelClient | undefined,
        private selectorPrompt: string | undefined,
        readonly onBeforeSendingToModel?: SendingMessage | undefined,
        readonly onAfterSendingToModel?: SendingMessage | undefined,
    ) { }

    public async handle(context: IContext): Promise<IContext> {
        if (this.modelClient && this.selectorPrompt) {
            return await this.getNewAssigneeFromModel(context);
        } else { //round robin
            const agents = this.manager.agents;
            if (agents.length === 0) return context;

            const assignee = getAssignee(context);
            if (assignee) {
                const lastIndex = agents.findIndex(a => a.name === assignee);
                const nextIndex = (lastIndex + 1) % agents.length;
                return setAssignee(context, agents[nextIndex].name);
            } else {
                return setAssignee(context, agents[0].name);
            }

        }
    }

    async getNewAssigneeFromModel(context: IContext): Promise<IContext> {

        const incomingMessages = getMessages(context, this.manager.name)
            ?.map(message => message.modelMessage);

        const messages = [
            { role: SYSTEM_ROLE, content: this.selectorPrompt },
        ].concat(incomingMessages);

        let currentContext = context;
        await this.onBeforeSendingToModel?.(messages);
        const reply = await this.modelClient?.generate({ messages }) as any;
        const content = reply?.content;

        //send itself a copy as its history
        currentContext = this.saveMessage(context,
            {
                role: MODEL_OUTBOUND_ROLE, // inbound/outboud is always a pair. inbound comes from agent's reply and end user
                content
            });
        await this.onAfterSendingToModel?.(getMessages(currentContext, this.manager.name)?.map(message => message.modelMessage));

        return { ...currentContext, assignees: (currentContext.assignees ?? []).concat({ name: content, assignedAt: new Date().toISOString() }) };
    }

    protected saveMessage(context: IContext, message: IModelMessage): IContext {
        return sendMessage(
            context,
            this.manager.name,
            this.manager.name,
            message
        )
    }
}
