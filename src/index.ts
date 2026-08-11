import { mkdirSync } from 'node:fs';
import { AgentLoop } from './agent/loop';
import { ContextBuilder } from './agent/context-builder';
import { StopCondition } from './agent/stop-condition';
import { ToolDispatcher } from './tools/dispatcher';
import { readFileTool, writeFileTool, deleteFileTool, setWorkspaceRoot } from './tools/file-tools';
import { shellTool } from './tools/shell-tool';
import { searchTool, gitDiffTool, runTestTool } from './tools/search-git-test-tools';
import { FeedbackValidator } from './feedback/validator';
import { FeedbackInjector } from './feedback/injector';
import { MemoryStore } from './memory/store';
import { SessionStore } from './server/session-store';
import { ConfigLoader } from './config/loader';
import { MockLLM } from './llm/mock-llm';
import { OpenAICompatibleProvider } from './llm/openai-compatible';
import type { LLMProvider } from './llm/provider';
import type { CredentialStore } from './credentials/store';
import { HarnessServer } from './server/http-server';
import { logger } from './utils/logger';
import { KeywordRetriever } from './memory/retriever';

async function createCredentialStore(): Promise<CredentialStore> {
  if (process.platform === 'win32') {
    const { WinCredentialStore } = await import('./credentials/win-credential');
    return new WinCredentialStore();
  }
  const { AESFileCredentialStore } = await import('./credentials/aes-file');
  const masterPassword = process.env.HARNESS_MASTER_PASSWORD || 'harness-default-key';
  return new AESFileCredentialStore(masterPassword);
}

async function createLLMProvider(credentialStore?: CredentialStore): Promise<LLMProvider> {
  const provider = process.env.LLM_PROVIDER || 'mock';
  const apiKey = process.env.LLM_API_KEY;

  if (provider === 'openai' || provider === 'openai-compatible') {
    let key = apiKey;
    if (!key && credentialStore) {
      key = await credentialStore.get('llm', provider) ?? undefined;
    }
    if (!key) {
      logger.warn('No API key found for OpenAI provider. Set LLM_API_KEY or store credentials.');
      return new MockLLM([]);
    }

    const baseURL = process.env.LLM_BASE_URL || undefined;
    const model = process.env.LLM_MODEL || undefined;
    logger.info('Using OpenAI-compatible provider', { model: model || 'gpt-4o', baseURL: baseURL || 'api.openai.com' });
    return new OpenAICompatibleProvider({ apiKey: key, baseURL, model });
  }

  logger.warn('No LLM provider configured. Using MockLLM with empty responses.');
  logger.warn('Set LLM_PROVIDER to \"openai\" and LLM_API_KEY to use a real LLM.');
  return new MockLLM([]);
}

async function main(): Promise<void> {
  const workspaceRoot = process.env.HARNESS_WORKSPACE || process.cwd();
  setWorkspaceRoot(workspaceRoot);
  logger.info('Workspace root set', { path: workspaceRoot });

  mkdirSync('data', { recursive: true });

  const configLoader = new ConfigLoader();
  const rules = configLoader.load('.rules');
  logger.info('Config loaded', { ruleCount: rules.length });

  const memoryStore = new MemoryStore('data/memory.db');
  const memoryEntries = memoryStore.list();
  const retriever = new KeywordRetriever();
  logger.info('Memory store initialized', { entryCount: memoryEntries.length });

  const sessionStore = new SessionStore('data/sessions.db');
  logger.info('Session store initialized', { path: 'data/sessions.db' });

  const tools = [readFileTool, writeFileTool, deleteFileTool, shellTool, searchTool, gitDiffTool, runTestTool];
  const dispatcher = new ToolDispatcher(tools);

  const contextBuilder = new ContextBuilder({
    systemPrompt: 'You are a coding agent. You can read, write, delete files, run shell commands, search code, check git diff, and run tests.',
    configRules: rules,
    memoryEntries,
    retriever,
    maxMemories: 5,
  });

  const stopCondition = new StopCondition({ maxRounds: 10 });
  const validator = new FeedbackValidator();
  const injector = new FeedbackInjector();

  const credentialStore = process.env.LLM_PROVIDER ? await createCredentialStore() : undefined;
  const llm = await createLLMProvider(credentialStore);

  const loop = new AgentLoop({
    llm,
    dispatcher,
    contextBuilder,
    stopCondition,
    validator,
    injector,
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  if (Number.isNaN(port)) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`);
  }
  new HarnessServer(loop, port, sessionStore, workspaceRoot);

  process.on('SIGTERM', () => {
    logger.info('Shutting down...');
    memoryStore.close();
    sessionStore.close();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('Shutting down...');
    memoryStore.close();
    sessionStore.close();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error('Fatal error during startup', { error: String(err) });
  process.exit(1);
});
