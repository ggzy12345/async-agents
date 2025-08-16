import { IModelMessage } from "../models/types";
import { IContext } from "./types";

export interface IAgentMessageHandler {
    handleMessages(
        context: IContext,
        from: string,
        messages: IModelMessage[]
    ): Promise<IContext>
}