# Async Agents Framework

A lightweight typescript AI agents framework for building concurrent applications with strong flow control.

## Features

- **Lock-less Architecture**: Stateless agents operate without shared memory locks  
- **Multi-Core Performance**: Utilizes worker threads for true parallelism  
- **Strong Flow Control**: Managed conversation workflows with hooks    
- **Modular Design**: Pluggable agents with tool integration support  
- **Async Processing**: Non-blocking operations with promise-based APIs. Can be integrated with broadcast channel, kafaka, sqs, pubsub, etc.

### Agents Patterns
1. **Round Robin**: Simple task distribution  
2. **Handoff**: Agent-to-agent conversation transfer  
3. **Tool Calling**: Function execution with reflection  
4. **Selector**: Intelligent agent assignment  
5. **Workflow**: Managed multi-step processes  
