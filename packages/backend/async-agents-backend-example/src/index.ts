import { Worker, BroadcastChannel } from "worker_threads";
import path from "path";
import { MAIN_CHANNEL } from "./utils/consts";
import { IContext, MODEL_INBOUND_ROLE, TYPE_NEW, END_USER_NAME, AGENT_MANAGER_NAME } from "async-agents-core";

const NUM_WORKERS = 3;
//const WORK_PATH_STRING = './worker_handoff.js';
const WORK_PATH_STRING = './worker_roundrobin.js';
//const WORK_PATH_STRING = './worker_selector.js';
//const WORK_PATH_STRING = './worker_toolcall.js';
//const WORK_PATH_STRING = './worker_workflow.js';
const workerPath = path.resolve(__dirname, WORK_PATH_STRING);

const workerChannels: BroadcastChannel[] = [];
let roundRobinIndex = 0;

function startWorker(id: number): void {
    const channelName = `worker-channel-${id}`;

    const worker = new Worker(workerPath, {
        workerData: { channel: channelName },
    });

    worker.on('error', err => {
        console.error(`Worker ${id} error:`, err);
    });
    worker.on('exit', code => {
        console.log(`Worker ${id} exited with code:`, code);
    });

    const channel = new BroadcastChannel(channelName);
    workerChannels.push(channel);
}

for (let i = 0; i < NUM_WORKERS; i++) {
    startWorker(i);
}

const mainChannel = new BroadcastChannel(MAIN_CHANNEL);
mainChannel.onmessage = (event: any) => {
    console.log("[Main] Got message from worker:", (event.data as IContext)?.messages
        ?.map(message => ({ ...message, modelMessage: message.modelMessage })));
};

function postToNextWorker(message: any) {
    const channel = workerChannels[roundRobinIndex];
    channel.postMessage(message);
    roundRobinIndex = (roundRobinIndex + 1) % workerChannels.length;
}

setTimeout(() => {
    const context: IContext = {
        messages: [
            {
                from: END_USER_NAME,
                to: AGENT_MANAGER_NAME,
                type: TYPE_NEW,
                createdAt: new Date().toISOString(),
                modelMessage: {
                    role: MODEL_INBOUND_ROLE,
                    content: 'Write a very short article about the impact of AI on society.'
                }
            }]
    };
    console.log("[Main] Sending:", context);
    postToNextWorker(context);
}, 3000);
