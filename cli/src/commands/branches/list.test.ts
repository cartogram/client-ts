import { Config } from '@oclif/core';
import fetch from 'node-fetch';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { clearEnvVariables } from '../utils.test.js';
import BranchesList from './list.js';

vi.mock('node-fetch');

clearEnvVariables();

afterEach(() => {
  vi.clearAllMocks();
});

const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

describe('branches list', () => {
  test('fails if no workspace is provided', async () => {
    const config = await Config.load();
    const list = new BranchesList([], config as Config);

    await expect(list.run()).rejects.toThrow(
      'Could not find workspace id. Please set XATA_DATABASE_URL or use the --workspace flag.'
    );
  });

  test('fails if no database is provided', async () => {
    const config = await Config.load();
    const list = new BranchesList(['--workspace', 'test-1234'], config as Config);

    await expect(list.run()).rejects.toThrow(
      'Could not find database name. Please set XATA_DATABASE_URL or use the --database flag.'
    );
  });

  test('fails if the HTTP response is not ok', async () => {
    fetchMock.mockReturnValue({
      ok: false,
      json: async () => ({
        message: 'Something went wrong'
      })
    });

    const config = await Config.load();
    const list = new BranchesList(['--workspace', 'test-1234', '--database', 'test'], config as Config);

    await expect(list.run()).rejects.toThrow('Something went wrong');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toEqual('https://test-1234.xata.sh/dbs/test');
    expect(fetchMock.mock.calls[0][1].method).toEqual('GET');
  });

  test.each([[false], [true]])('returns the data with enabled = %o', async (json) => {
    fetchMock.mockReturnValue({
      ok: true,
      json: async () => ({
        branches: [
          {
            name: 'main',
            createdAt: '2020-01-01T00:00:00.000Z'
          }
        ]
      })
    });

    const config = await Config.load();
    const list = new BranchesList(['--workspace', 'test-1234', '--database', 'test'], config as Config);

    expect(BranchesList.enableJsonFlag).toBe(true);
    vi.spyOn(list, 'jsonEnabled').mockReturnValue(json);

    const printTable = vi.spyOn(list, 'printTable');

    const result = await list.run();

    if (json) {
      expect(result).toMatchInlineSnapshot(`
        [
          {
            "createdAt": "2020-01-01T00:00:00.000Z",
            "name": "main",
          },
        ]
      `);
    } else {
      expect(result).toBeUndefined();
    }

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toEqual('https://test-1234.xata.sh/dbs/test');
    expect(fetchMock.mock.calls[0][1].method).toEqual('GET');

    expect(printTable).toHaveBeenCalledTimes(json ? 0 : 1);

    if (!json) {
      expect(printTable.mock.calls[0]).toMatchInlineSnapshot(`
        [
          [
            "Name",
            "Created at",
          ],
          [
            [
              "main",
              "Jan 1, 2020, 1:00 AM",
            ],
          ],
        ]
      `);
    }
  });
});
