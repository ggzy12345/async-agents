
# AI Prompt Examples

## 1. Multi-Agent Collaboration Example

**Scenario Description**:  
The system has multiple agents working together to process context. How can an AgentManager manage multiple agents and invoke them in a loop?

**Example Prompt**:  
Please help me write a minimal TypeScript example of multi-agent collaboration, based on existing Agent and AgentManager classes, including two agents, scheduling conversations in a loop, and outputting the conversation history.

---

## 2. Hooks Usage Example

**Scenario Description**:  
Use beforeHooks and afterHooks inside the AgentManager to intercept context and print logs.

**Example Prompt**:  
Please help me write a TypeScript example showing how to register beforeHooks and afterHooks in AgentManager, where beforeHooks prints the context state, and afterHooks adds a timestamp.

---

## 3. onContextChanged Callback Example

**Scenario Description**:  
Listen for context changes inside AgentManager, print the changed fields, and demonstrate how to handle logging.

**Example Prompt**:  
Please help me write a TypeScript example showing how to set an onContextChanged callback in AgentManager, where the callback prints the changed context fields, along with the old and new states.

---

## 4. BroadcastChannel Multi-Thread Communication Example

**Scenario Description**:  
Use BroadcastChannel to enable multi-threaded agent communication, listening for messages and sending commands.

**Example Prompt**:  
Please help me write a TypeScript example using BroadcastChannel to implement simple multi-thread message listening and sending.

---

## 5. GCP Pub/Sub Integration Example

**Scenario Description**:  
Integrate GCP Pub/Sub in Node.js to enable message publishing and subscription.

**Example Prompt**:  
Please help me write a Node.js TypeScript example showing how to use the @google-cloud/pubsub library to implement message publishing and subscribing.
