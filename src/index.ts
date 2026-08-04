import { AgentLoop } from './agent/loop';
import { ContextBuilder } from './agent/context-builder';
import { StopCondition } from './agent/stop-condition';
import { ToolDispatcher } from './tools/dispatcher';
import { readFileTool, writeFileTool, deleteFileTool } from './tools/file-tools';
import { shellTool } from './tools/shell-tool';
import { searchTool, gitDiffTool, runTestTool } from './tools/search-git-test-tools';
import { FeedbackValidator } from './feedback/validator';
import { FeedbackInjector } from './feedback/injector';
import { MemoryStore } from './memory/store';
import { ConfigLoader } from './config/loader';
import { MockLLM } from './llm/mock-llm';
import { HarnessServer } from './server/http-server';

const configLoader = new ConfigLoader();
const rules = configLoader.load('.rules');

const memoryStore = new MemoryStore('data/memory.db');
const memories = memoryStore.list().map((m) => `${m.key}: ${m.value}`);

const tools = [readFileTool, writeFileTool, deleteFileTool, shellTool, searchTool, gitDiffTool, runTestTool];
const dispatcher = new ToolDispatcher(tools);

const contextBuilder = new ContextBuilder({
  systemPrompt: 'You are a coding agent. You can read, write, delete files, run shell commands, search code, check git diff, and run tests.',
  configRules: rules,
  memories,
  toolDefinitions: dispatcher.getDefinitions(),
});

const stopCondition = new StopCondition({ maxRounds: 10 });
const validator = new FeedbackValidator();
const injector = new FeedbackInjector();

const llm = new MockLLM([]);

const loop = new AgentLoop({
  llm,
  dispatcher,
  contextBuilder,
  stopCondition,
  validator,
  injector,
});

new HarnessServer(loop, 3000);