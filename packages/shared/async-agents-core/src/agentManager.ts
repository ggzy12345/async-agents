import { AbstractAgent } from "./agents/abstractAgent";
import { COMPLETE, IContext, Handle, IAgentManagerProps, IHandler, INPROGRESS, AGENT_MANAGER_NAME, Predict, OnError, OnAgentMessage } from "./types/types";
import { forwardMessage, getAssignee, getMessage, isEmpty, setAssignee } from "./utils";
import { ManagerAssigneeSelector } from "./selectors/managerAssigneeSelector";
import { IAgentRegister } from "./types/agentRegister";

export class AgentManager implements IAgentRegister, IHandler {
    readonly name: string;
    readonly agents: AbstractAgent[] = [];
    private shouldTerminate: Predict;
    private assigneeSelector;
    private beforeHooks: Handle[];
    private afterHooks: Handle[];
    private onIncomingMessage: OnAgentMessage | undefined;
    private onError: OnError | undefined;
    private debug: boolean;

    constructor({
        shouldTerminate,
        selectorPrompt,
        modelClient,
        beforeHooks,
        afterHooks,
        onIncomingMessage,
        onBeforeSendingToModel,
        onAfterSendingToModel,
        onError,
        debug
    }: IAgentManagerProps) {
        this.name = AGENT_MANAGER_NAME;
        this.shouldTerminate = shouldTerminate;
        this.assigneeSelector = new ManagerAssigneeSelector(this,
            modelClient,
            selectorPrompt,
            onBeforeSendingToModel,
            onAfterSendingToModel);
        this.afterHooks = afterHooks ?? [];
        this.beforeHooks = beforeHooks ?? [];
        this.onIncomingMessage = onIncomingMessage;
        this.onError = onError;
        this.debug = debug ?? false;
    }

    public register(agent: AbstractAgent): void {
        agent.setManager(this);
        agent.setDebug(this.debug);
        this.agents.push(agent);
    }

    public async handle(context: IContext): Promise<IContext> {
        let currentContext = context;

        currentContext = {
            ...currentContext,
            state: INPROGRESS
        };

        let loopCount = currentContext.round ?? 0;
        while (currentContext && loopCount++ < 10) {
            try {
                currentContext = {
                    ...currentContext,
                    round: loopCount
                };

                for (const hook of this.beforeHooks) {
                    currentContext = await hook(currentContext);
                }

                if (currentContext.messages?.length >= 2) {
                    const modelReplyText = currentContext?.messages
                        ?.[currentContext.messages?.length - 2]
                        ?.modelMessage?.content;

                    if (this.shouldTerminate(currentContext, modelReplyText)) {
                        this.debug && console.debug(`Session COMPLETE"`);
                        return ({ ...currentContext, state: COMPLETE });
                    };
                }

                //step 1: manager handle incoming message
                currentContext = await this.handleIncomingMessage(currentContext);

                //step 2: notifiy agents that the manager sends message to one of them
                for (const agent of this.agents) {
                    currentContext = await agent.handle(currentContext);
                }

                for (const hook of this.afterHooks) {
                    currentContext = await hook(currentContext);
                }

            } catch (error) {
                this.debug && console.error('Failed to handle message', currentContext, error);
                this.onError?.(currentContext, error);
                return currentContext;
            }
        }
        return currentContext;
    }

    private async handleIncomingMessage(context: IContext): Promise<IContext> {
        let currentContext = context
        //step 1: get the incoming message
        const incomingMessage = getMessage(currentContext, this.name);
        await this.onIncomingMessage?.(incomingMessage);
        //step 2: find the assigned agent
        currentContext = await this.selectAssignee(context);
        //step 3: forward the incoming message to the agent
        currentContext = forwardMessage(currentContext, this.name, getAssignee(currentContext), incomingMessage?.modelMessage);
        return currentContext;
    }

    private async selectAssignee(context: IContext): Promise<IContext> {
        let currentContext = context;
        const agent = this.agents.find(agent => !isEmpty(agent.handOffs));
        if (agent) {
            if (!Boolean(getAssignee(currentContext))) { //for agent handoff, the first round has to hapen first
                currentContext = setAssignee(currentContext, this.agents[0].name);
            } else {
                const agent = this.agents.find(agent => agent.name === getAssignee(currentContext));
                if (!agent) {
                    throw new Error(`selectAssignee agent ${getAssignee(currentContext)} not found`);
                }
                currentContext = await agent.selectAssignee(currentContext);
            }
        } else {
            currentContext = await this.assigneeSelector.handle(currentContext);
        }


        return currentContext;
    }

}
