import { Config } from '@oclif/core';
// import { mkdir, writeFile } from 'fs/promises';
import { fs as fsMem, vol, Volume } from 'memfs';
import fetch from 'node-fetch';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import which from 'which';
import { spawn } from 'child_process';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { clearEnvVariables } from '../utils.test.js';
import Init from './index.js';
import { isIgnored } from '../../git';
import prompts from 'prompts';
import { mockFsMethods, relativeToCwdFiles, cwdToRelativeFiles } from '../../utils/mockFs';
import mockFs from 'mock-fs';
import path from 'path'

vi.mock('prompts');
vi.mock('node-fetch');
// vi.mock('fs/promises');
// vi.mock('fs');
vi.mock('which');
vi.mock('child_process');
vi.mock('../../git');

clearEnvVariables();

beforeEach(() => {
  process.env.XATA_API_KEY = '1234abcdef';
  process.env.XATA_BRANCH = 'main';
});

afterEach(() => {
  vi.clearAllMocks();
});

const fetchImplementation = (url: string, request: any) => {
  if (url === 'https://api.xata.io/workspaces' && request.method === 'GET') {
    return {
      ok: true,
      json: async () => ({
        workspaces: [{ id: 'test-1234', name: 'test-1234' }]
      })
    };
  } else if (url === 'https://api.xata.io/workspaces/test-1234/dbs' && request.method === 'GET') {
    return {
      ok: true,
      json: async () => ({
        databases: [{ name: 'db1' }]
      })
    };
  } else if (url === 'https://api.xata.io/workspaces/test-1234/dbs/db1/rename' && request.method === 'POST') {
    return {
      ok: true,
      json: async () => ({})
    };
  }
};

const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
const promptsMock = prompts as unknown as ReturnType<typeof vi.fn>;
const isGitIgnoredMock = isIgnored as unknown as ReturnType<typeof vi.fn>;
const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;

const runInitTest = async (
  files: Record<string, string>,
  args: string[] = [],
  prompts: Record<string, any> = { workspace: 'test-1234', database: 'db1' },
  setupCommand: (command: Init) => void = () => null
) => {
  const vol = Volume.fromJSON(files);

  // mockFsMethods(fs, fsPromises, vol);
  fetchMock.mockImplementation(fetchImplementation);
  promptsMock.mockReturnValue(prompts);

  const config = await Config.load();
  mockFs({
    ...files,
    'node_modules/.pnpm/cosmiconfig@8.1.3': mockFs.load(path.resolve(__dirname, '../../../../node_modules/.pnpm/cosmiconfig@8.1.3')),
    'node_modules/.pnpm/@oclif+core@2.8.5_@types+node@20.2.3_typescript@5.0.4': mockFs.load(path.resolve(__dirname, '../../../../node_modules/.pnpm/@oclif+core@2.8.5_@types+node@20.2.3_typescript@5.0.4'))
  })


  console.log('zzz 123', fs.readdirSync('./'))

  const command = new Init(['--no-delay', ...args], config);
  const log = vi.spyOn(command, 'log');
  setupCommand(command)
  await command.init()
  await command.run();
  console.log('zzz', mockFs.getMockRoot())
  console.log('zzz 123', fs.readdirSync('./'))
  mockFs.restore()

  return { log, promptsMock, outputFiles: cwdToRelativeFiles(vol.toJSON()) };
};

describe('init', () => {

  test('errors when .xatarc already exists', async () => {
    await expect(runInitTest({ '.xatarc': '{}' }, [], { workspace: 'test-1234', database: 'db1', gitIgnore: false }, (command) => {
      command.projectConfigLocation = '.xatarc';
    })).rejects.toMatchInlineSnapshot('[Error: Project already configured at $PWD/.xatarc. Use --force to overwrite it]');
  });

  test('creates .xatarc', async () => {
    const files: Record<string, string> = {
      '$PWD/readme.md': ''
    };
    const { log, outputFiles } = await runInitTest(files);
    expect(log.mock.calls.flat()).toContain('Created Xata config: .xatarc');
    expect(outputFiles['$PWD/.xatarc']).toMatchInlineSnapshot(`
      "{
        \\"databaseURL\\": \\"https://test-1234.undefined.xata.sh/db/db1\\"
      }"
    `);
  });

  test('creates xyz', async () => {
    const files: Record<string, string> = {
      './readme.md': ''
    };
    vi.spyOn(which, 'sync').mockImplementation(() => '/usr/local/bin/pnpm')
    spawnMock.mockImplementation(() => ({ on: (string: any, func: any) => func(0) }))
    const { log, outputFiles, promptsMock } = await runInitTest(files, [], { workspace: 'test-1234', database: 'db1', codegen: 'ts', file: 'src/xataCustom.ts', declarations: true, packageManagerName: 'pnpm' });
    console.log(promptsMock.mock.calls)
    expect(outputFiles).toMatchInlineSnapshot(`
      "{
        \\"databaseURL\\": \\"https://test-1234.undefined.xata.sh/db/db1\\"
      }"
    `);
  });

  test('creates .env', async () => {
    const files: Record<string, string> = {
      '$PWD/readme.md': ''
    };
    const { log, outputFiles } = await runInitTest(files);
    expect(log.mock.calls.flat()).toContain('Creating .env file');
    expect(outputFiles['$PWD/.env']).toMatchInlineSnapshot(`
      "# [Xata] Configuration used by the CLI and the SDK
      # Make sure your framework/tooling loads this file on startup to have it available for the SDK
      XATA_BRANCH=main
      XATA_API_KEY=1234abcdef
      "
    `);
  });

  test('updates .env', async () => {
    const files: Record<string, string> = {
      '$PWD/.env': 'UNRELATED_ENV_VAR=123'
    };
    const { log, outputFiles } = await runInitTest(files);

    expect(log.mock.calls.flat()).toContain('Updating .env file');
    expect(outputFiles['$PWD/.env']).toMatchInlineSnapshot(`
      "UNRELATED_ENV_VAR=123

      # [Xata] Configuration used by the CLI and the SDK
      # Make sure your framework/tooling loads this file on startup to have it available for the SDK
      XATA_BRANCH=main
      XATA_API_KEY=1234abcdef
      "
    `);
  });

  test('git ignore prompt true creates .gitignore', async () => {
    const files: Record<string, string> = {
      '$PWD/.env': 'UNRELATED_ENV_VAR=123'
    };
    isGitIgnoredMock.mockReturnValue(false);
    const { log, outputFiles } = await runInitTest(files, [], { workspace: 'test-1234', database: 'db1', gitIgnore: true });

    expect(log.mock.calls.flat()).toContain('Added .env file to .gitignore');
    expect(outputFiles['$PWD/.gitignore']).toMatchInlineSnapshot(`
      ".env
      "
    `);
  });

  test('git ignore prompt false does not create .gitignore', async () => {
    const files: Record<string, string> = {
      '$PWD/.env': 'UNRELATED_ENV_VAR=123',
    };
    isGitIgnoredMock.mockReturnValue(false);
    const { outputFiles } = await runInitTest(files, [], { workspace: 'test-1234', database: 'db1', gitIgnore: false });

    expect(outputFiles['$PWD/.gitignore']).toBeUndefined()
  });

  test('already git ignored does not update .gitignore', async () => {
    const files: Record<string, string> = {
      '$PWD/.env': 'UNRELATED_ENV_VAR=123',
      '$PWD/.gitignore': 'node_modules\n.env',
    };
    isGitIgnoredMock.mockReturnValue(true);
    const { outputFiles } = await runInitTest(files, [], { workspace: 'test-1234', database: 'db1', gitIgnore: true });

    expect(outputFiles['$PWD/.gitignore']).toEqual(files['$PWD/.gitignore']);
  });


  test('git ignore prompt true updates .gitignore', async () => {
    const files: Record<string, string> = {
      '$PWD/.env': 'UNRELATED_ENV_VAR=123',
      '$PWD/.gitignore': 'node_modules',
    };
    isGitIgnoredMock.mockReturnValue(false);
    const { log, outputFiles } = await runInitTest(files, [], { workspace: 'test-1234', database: 'db1', gitIgnore: true });

    expect(log.mock.calls.flat()).toContain('Added .env file to .gitignore');
    expect(outputFiles['$PWD/.gitignore']).toMatchInlineSnapshot(`
      "node_modules

      .env
      "
    `);
  });


  test('git ignore prompt false does not update .gitignore', async () => {
    const files: Record<string, string> = {
      '$PWD/.env': 'UNRELATED_ENV_VAR=123',
      '$PWD/.gitignore': 'node_modules',
    };
    isGitIgnoredMock.mockReturnValue(false);
    const { outputFiles } = await runInitTest(files, [], { workspace: 'test-1234', database: 'db1', gitIgnore: false });

    expect(outputFiles['$PWD/.gitignore']).toMatchInlineSnapshot(`
    "node_modules"
      `);
  });
})
