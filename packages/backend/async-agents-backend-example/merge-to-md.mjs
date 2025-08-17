import fs from "fs";
import path from "path";

const projectName = "Async Agents Example";
const description = "Minimal 8-file AI agents system for generating application code.";
const dependencies = [
    "Node.js 18+",
    "TypeScript"
];

const srcDir = path.resolve("./src");

const customFileOrder = [
    "index.ts",
    "manager.ts",
    "agent.ts",
    "selectors.ts",
    "context.ts",
    "messages.ts",
    "config.ts",
    "utils.ts"
];

const includeFiles = [
    "index.ts",
    "manager.ts",
    "agent.ts",
    "selectors.ts",
    "context.ts",
    "messages.ts",
    "config.ts",
    "utils.ts"
];
const excludeFiles = [
    "secret-config.ts",
    "private-key.ts"
];

function getFiles(dir) {
    let results = [];
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(getFiles(fullPath));
        } else {
            results.push(fullPath);
        }
    });
    return results;
}

function sortFiles(files) {
    const orderMap = new Map(customFileOrder.map((name, i) => [name, i]));
    return files.sort((a, b) => {
        const aName = path.basename(a);
        const bName = path.basename(b);
        const aIdx = orderMap.has(aName) ? orderMap.get(aName) : Infinity;
        const bIdx = orderMap.has(bName) ? orderMap.get(bName) : Infinity;
        return aIdx - bIdx || a.localeCompare(b);
    });
}

function filterFiles(files, mode) {
    const fileNames = f => path.relative(srcDir, f);
    if (mode === "whitelist") {
        return files.filter(f => includeFiles.includes(fileNames(f)));
    }
    if (mode === "blacklist") {
        return files.filter(f => !excludeFiles.includes(fileNames(f)));
    }
    return files;
}

function compressCode(code, ext) {
    if (!ext.match(/ts|js/)) return code;
    return code
        .split("\n")
        .filter(line => {
            const t = line.trim();
            if (t === "") return false;
            if (t.startsWith("//")) return false;
            if (t.startsWith("/*") || t.endsWith("*/")) return false;
            return true;
        })
        .join("\n");
}

function generateMarkdown(files, compress = false) {
    let md = `# Project: ${projectName}\n`;
    md += `Description: ${description}\n`;
    md += `Dependencies:\n`;
    dependencies.forEach(dep => md += `- ${dep}\n`);
    md += `\n## Project Structure\n`;
    files.forEach(file => {
        md += `- ${path.relative(process.cwd(), file)}\n`;
    });

    md += `\n---\n`;

    files.forEach(file => {
        const ext = path.extname(file).slice(1) || "txt";
        let code = fs.readFileSync(file, "utf8");
        if (compress) code = compressCode(code, ext);
        md += `\n## File: ${path.relative(process.cwd(), file)}\n`;
        md += `\`\`\`${ext}\n${code}\n\`\`\`\n`;
    });

    return md;
}

function saveMarkdown(filename, files, compress) {
    const md = generateMarkdown(files, compress);
    fs.writeFileSync(filename, md, "utf8");
    console.log(`Writing to a File: ${filename}  （compression: ${compress ? "Yes" : "No"}）`);
}

const allFiles = getFiles(srcDir);
const filteredFiles = filterFiles(allFiles, "blacklist");
const sortedFiles = sortFiles(filteredFiles);

//saveMarkdown("project-full.md", sortedFiles, false);
saveMarkdown("project-ai.md", sortedFiles, true);
//saveMarkdown("project-full.md", sortedFiles, false);
function generateAIPromptDoc() {
    return `
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

## 3. BroadcastChannel Multi-Thread Communication Example

**Scenario Description**:  
Use BroadcastChannel to enable multi-threaded agent communication, listening for messages and sending commands.

**Example Prompt**:  
Please help me write a TypeScript example using BroadcastChannel to implement simple multi-thread message listening and sending.

---

## 4. GCP Pub/Sub Integration Example

**Scenario Description**:  
Integrate GCP Pub/Sub in Node.js to enable message publishing and subscription.

**Example Prompt**:  
Please help me write a Node.js TypeScript example showing how to use the @google-cloud/pubsub library to implement message publishing and subscribing.
`;
}

fs.writeFileSync("ai-prompt-examples.md", generateAIPromptDoc(), "utf8");
console.log("Writing to a File: ai-prompt-examples.md");

