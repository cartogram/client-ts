import { Flags } from '@oclif/core';
import { BaseCommand } from '../base.js';

export function csvFlags<Prefix extends string>(prefix: Prefix) {
  const flags = {
    delimiter: Flags.string({
      description: 'The delimiter to use for parsing CSV data'
    }),
    header: Flags.boolean({
      description: 'Whether the CSV data has a header row'
    }),
    skipEmptyLines: Flags.boolean({
      description: 'Whether to skip empty lines in the CSV data'
    }),
    nullValues: Flags.string({
      description: 'The values to interpret as null',
      multiple: true
    }),
    quoteChar: Flags.string({
      description: 'The character to use for quoting fields'
    }),
    escapeChar: Flags.string({
      description: 'The character to use for escaping the quote character within a field'
    }),
    newline: Flags.string({
      description: 'The newline sequence to use for parsing CSV data',
      options: ['\r', '\n', '\r\n']
    }),
    commentPrefix: Flags.string({
      description: 'The prefix to use for comments'
    }),
    types: Flags.string({
      description: 'Column types separated by commas'
    }),
    columns: Flags.string({
      description: 'Column names separated by commas'
    })
  };

  return Object.fromEntries(Object.entries(flags).map(([name, flag]) => [`${prefix}${name}`, flag])) as AddPrefix<
    typeof flags,
    Prefix
  >;
}

type AddPrefix<T, P extends string> = {
  [K in keyof T as `${P}${K extends string ? K : never}`]: T[K];
};

export function commonImportFlags() {
  return {
    encoding: Flags.string({
      description: 'Encoding of the CSV file',
      default: 'utf8' as const
    }),
    table: Flags.string({
      description: 'The table where the CSV file will be imported to',
      required: true
    }),
    branch: BaseCommand.branchFlag
  };
}