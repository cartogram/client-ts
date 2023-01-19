import { Flags } from '@oclif/core';
import fetch from 'node-fetch';
import { z } from 'zod';
import { BaseCommand } from '../../base.js';
import { buildWatcher, compileWorkers, workerScriptSchema } from '../../workers.js';
import Codegen from '../codegen/index.js';
import dotenv from 'dotenv';
import { readFile } from 'fs/promises';

const UPLOAD_ENDPOINT = 'https://app.xata.io/api/workers';

export default class Upload extends BaseCommand {
  static description = 'Compile and upload xata workers';

  static flags = {
    ...this.databaseURLFlag,
    include: Flags.string({
      description: 'Include a glob pattern of files to compile'
    }),
    ignore: Flags.string({
      description: 'Exclude a glob pattern of files to compile'
    }),
    'include-env-var': Flags.string({
      description: 'Variables to include as secrets',
      multiple: true
    }),
    env: Flags.string({
      description: 'File to include environment variables from'
    })
  };

  async run(): Promise<void> {
    // TODO: Load them from .xatarc too
    const { flags } = await this.parse(Upload);

    const profile = await this.getProfile();
    if (!profile) this.error('No profile found');

    const { workspace, region, database, databaseURL } = await this.getParsedDatabaseURL(flags.db);

    const environment =
      flags['include-env-var']?.reduce((acc, env) => {
        const value = process.env[env];
        if (value) acc[env] = value;
        return acc;
      }, {} as Record<string, string>) ?? dotenv.parse(flags.env ? await readFile(flags.env).catch(() => '') : '');

    const { watcher } = buildWatcher({
      compile: (path) => compileWorkers(path),
      run: async (workers) => {
        this.log(`Uploading ${workers.length} workers`);

        const body: Body = {
          workspace,
          database,
          region,
          connection: {
            databaseUrl: databaseURL,
            // TODO: Database scoped service API Key (backend generated)
            apiKey: profile.apiKey
          },
          environment,
          scripts: Array.from(workers.values())
        };

        const response = await fetch(UPLOAD_ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${profile.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        const json = await response.json();

        const { id } = responseSchema.parse(json);

        this.info(`Successfully compiled worker ${id}`);

        if (this.projectConfig?.codegen) {
          this.log(`Running codegen...`);
          this.projectConfig.codegen.workersBuildId = id;
          await this.updateConfig();
          await Codegen.run([]);
        } else {
          this.warn(`Unable to run codegen, no codegen config found`);
        }

        await watcher.close();

        return () => Promise.resolve();
      },
      included: flags.include?.split(','),
      ignored: flags.ignore?.split(',')
    });
  }
}

const bodySchema = z.object({
  workspace: z.string(),
  database: z.string(),
  region: z.string(),
  connection: z.object({
    databaseUrl: z.string(),
    apiKey: z.string()
  }),
  environment: z.record(z.string().min(1)),
  scripts: z.array(workerScriptSchema)
});

type Body = z.infer<typeof bodySchema>;

const responseSchema = z.object({
  id: z.string(),
  createdBy: z.string(),
  createdAt: z.string()
});
