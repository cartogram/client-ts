import { Span, trace as traceAPI, context as contextAPI, Context } from '@opentelemetry/api';
import realFetch from 'cross-fetch';
import dotenv from 'dotenv';
import { join } from 'path';
import { File, suite, Suite, Test, TestContext, vi } from 'vitest';
import { BaseClient, CacheImpl, XataApiClient } from '../../packages/client/src';
import { getHostUrl, HostProvider, isHostProviderAlias } from '../../packages/client/src/api/providers';
import { TraceAttributes, TraceFunction } from '../../packages/client/src/schema/tracing';
import { XataClient } from '../../packages/codegen/example/xata';
import { buildTraceFunction } from '../../packages/plugin-client-opentelemetry/dist';
import { teamColumns, userColumns } from '../mock_data';
import { getTracer, setupTracing } from './tracing';

// Get environment variables before reading them
dotenv.config({ path: join(process.cwd(), '.env') });

const apiKey = process.env.XATA_API_KEY ?? '';
if (apiKey === '') throw new Error('XATA_API_KEY environment variable is not set');

const workspace = process.env.XATA_WORKSPACE ?? '';
if (workspace === '') throw new Error('XATA_WORKSPACE environment variable is not set');

const host = getProvider(process.env.XATA_API_PROVIDER);
const fetch = vi.fn(realFetch);

export type EnvironmentOptions = {
  cache?: CacheImpl;
};

export type TestEnvironmentResult = {
  api: XataApiClient;
  client: XataClient;
  baseClient: BaseClient;
  database: string;
  workspace: string;
  clientOptions: {
    databaseURL: string;
    fetch: typeof fetch;
    apiKey: string;
    branch: string;
    cache?: CacheImpl;
  };
  hooks: {
    beforeAll: (ctx: Suite | File) => Promise<void>;
    afterAll: (ctx: Suite | File) => Promise<void>;
    beforeEach: (ctx: TestContext) => Promise<void>;
    afterEach: (ctx: TestContext) => Promise<void>;
  };
};

export async function setUpTestEnvironment(
  prefix: string,
  { cache }: EnvironmentOptions = {}
): Promise<TestEnvironmentResult> {
  const tracer = getTracer();
  let trace: any | undefined;
  if (tracer) {
    trace = buildTraceFunction(tracer);
  }
  const workspaceUrl = getHostUrl(host, 'workspaces').replace('{workspaceId}', workspace);

  // All setup actions belong to the setup span
  const suiteSpan = tracer?.startSpan(
    'test suite: ' + prefix,
    { attributes: { [TraceAttributes.KIND]: 'test-suite' } },
    contextAPI.active()
  );
  let setupSpan: Span | undefined;
  let setupSpanCtx: Context | undefined;
  if (tracer && suiteSpan) {
    const suiteSpanCtx = traceAPI.setSpan(contextAPI.active(), suiteSpan);
    setupSpan = tracer.startSpan(
      'setup environment',
      { attributes: { [TraceAttributes.KIND]: 'test-suite-setup' } },
      suiteSpanCtx
    );
    setupSpanCtx = traceAPI.setSpan(suiteSpanCtx, setupSpan);
  }

  // Setup the environment
  let database: string | undefined;
  try {
    if (!setupSpanCtx) {
      database = await setupXata(prefix, trace);
    } else {
      await contextAPI.with(setupSpanCtx, async () => {
        database = await setupXata(prefix, trace);
      });
    }
  } finally {
    setupSpan?.end();
  }

  const hooks = {
    beforeAll: async () => {
      return;
    },
    afterAll: async () => {
      await api.databases.deleteDatabase(workspace, database!);
      suiteSpan?.end();
    },
    beforeEach: async (ctx: TestContext) => {
      if (tracer && suiteSpan) {
        const suiteSpanCtx = traceAPI.setSpan(contextAPI.active(), suiteSpan);
        ctx.span = tracer.startSpan(
          'test case: ' + ctx.meta.name,
          { attributes: { [TraceAttributes.KIND]: 'test-case' } },
          suiteSpanCtx
        );
        ctx.suiteSpanCtx = suiteSpanCtx;
      }
    },
    afterEach: async (ctx: TestContext) => {
      ctx.span?.end();
    }
  };

  const clientOptions = {
    databaseURL: `${workspaceUrl}/db/${database!}`,
    branch: 'main',
    apiKey,
    fetch,
    cache,
    trace: trace
  };

  const api = new XataApiClient({ apiKey, fetch, host, trace: trace });
  const client = new XataClient(clientOptions);
  const baseClient = new BaseClient(clientOptions);

  return { api, client, baseClient, clientOptions, database: database!, workspace, hooks };
}

async function setupXata(prefix: string, trace: TraceFunction) {
  const api = new XataApiClient({ apiKey, fetch, host, trace });
  // Timestamp to avoid collisions
  const id = Date.now().toString(36);
  const { databaseName: database } = await api.databases.createDatabase(
    workspace,
    `sdk-integration-test-${prefix}-${id}`
  );

  await api.tables.createTable(workspace, database, 'main', 'teams');
  await api.tables.createTable(workspace, database, 'main', 'users');
  await api.tables.setTableSchema(workspace, database, 'main', 'teams', { columns: teamColumns });
  await api.tables.setTableSchema(workspace, database, 'main', 'users', { columns: userColumns });

  return database;
}

function getProvider(provider = 'production'): HostProvider {
  if (isHostProviderAlias(provider)) {
    return provider;
  }

  const [main, workspaces] = provider.split(',');
  if (!main || !workspaces) {
    throw new Error(
      `Invalid XATA_API_PROVIDER environment variable, expected either "production", "staging" or "apiUrl,workspacesUrl"`
    );
  }
  return { main, workspaces };
}

declare module 'vitest' {
  export interface TestContext {
    span?: Span;
    suiteSpanCtx?: Context;
  }
}
