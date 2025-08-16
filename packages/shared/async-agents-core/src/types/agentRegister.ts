import { AbstractAgent } from "../agents/abstractAgent";

export interface IAgentRegister {
    register(agent: AbstractAgent): void;
}