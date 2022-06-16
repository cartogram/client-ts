import _ from 'lodash';
import { BaseCommand } from '../../base.js';
import { currentGitBranch, isGitRepo, listBranches } from '../../git.js';
export default class BranchesList extends BaseCommand {
  static description = 'List branches';

  static examples = [];

  static flags = {
    ...this.commonFlags,
    databaseURL: this.databaseURLFlag
  };

  static args = [];

  static enableJsonFlag = true;

  async run(): Promise<any> {
    const { flags } = await this.parse(BranchesList);
    const { workspace, database } = await this.getParsedDatabaseURL(flags.databaseURL);

    const xata = await this.getXataClient();
    const { branches } = await xata.branches.getBranchList(workspace, database);
    const { mapping } = await xata.databases.getGitBranchesMapping(workspace, database);

    const git = isGitRepo();
    const gitBranches = git ? listBranches() : [];
    const current = git ? currentGitBranch() : null;

    const data = branches.map((branch) => {
      const { gitBranch } = mapping.find(({ xataBranch }) => xataBranch === branch.name) ?? {};
      const git = gitBranches.find(({ name }) => name === branch.name);

      return {
        ...branch,
        mapping: gitBranch,
        git: {
          found: git !== undefined,
          current: current === branch.name,
          local: git?.local ?? false,
          remotes: git?.remotes ?? []
        }
      };
    });

    if (this.jsonEnabled()) return data;

    const rows = data.map((b) => [
      b.name,
      this.formatDate(b.createdAt),
      _.compact([
        b.mapping ?? b.git.found ? b.name : '-',
        b.git.current
          ? '(Current)'
          : b.git.local
          ? '(Local)'
          : b.git.found
          ? `(Remote: ${b.git.remotes.join(', ')})`
          : undefined
      ]).join(' ')
    ]);

    this.printTable(['Name', 'Created at', 'Git branch'], rows);
  }
}
