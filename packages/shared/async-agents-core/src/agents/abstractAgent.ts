import { IAgentProps, IContext, Handle, IHandler, ISupports, AgentName } from "../types/types";
import { getAssignee, getMessage, getMessages, sendMessage } from "../utils";
import { IAgentMessageHandler } from "../types/agentMessageHandler";
import { IModelMessage } from "../models/types";
import { AgentManager } from "../agentManager";

export abstract class AbstractAgent implements ISupports, IHandler, IAgentMessageHandler {
    public manager: AgentManager | undefined;
    readonly name: string;
    private beforeHooks: Handle[];
    private afterHooks: Handle[];
    readonly handOffs: AgentName[];
    public debug: boolean;

    constructor({ name, beforeHooks, afterHooks, handOffs }: IAgentProps) {
        this.name = name;
        this.beforeHooks = beforeHooks ?? [];
        this.afterHooks = afterHooks ?? [];
        this.handOffs = handOffs ?? [];
        this.debug = false;
    }
    public abstract handleMessages(
        context: IContext,
        from: string,
        messages: IModelMessage[]
    ): Promise<IContext>;

    public abstract selectAssignee(context: IContext): Promise<IContext>;

    public supports(context: IContext): boolean {
        return this.name === getAssignee(context);
    }

    public async handle(context: IContext): Promise<IContext> {

        if (!this.supports(context)) {
            return context;
        }

        let currentContext = context;
        for (const hook of this.beforeHooks) {
            currentContext = await hook(currentContext);
        }

        const message = getMessage(context, this.name);
        const messages = getMessages(context, this.name).map(message => message.modelMessage);
        currentContext = await this.handleMessages(context, message?.from ?? '', messages);

        for (const hook of this.afterHooks) {
            currentContext = await hook(currentContext);
        }

        return currentContext;
    }

    public setManager(manager: AgentManager): void {
        this.manager = manager
    }

    protected saveMessage(context: IContext, message: IModelMessage): IContext {
        return sendMessage(
            context,
            this.name,
            this.name,
            message
        )
    }

    public setDebug(debug: boolean) {
        this.debug = debug;
    }

}
