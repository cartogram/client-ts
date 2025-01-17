import { isNil, omit } from 'lodash';
import { Readable } from 'stream';
import { describe, expect, test } from 'vitest';
import { CsvResults, ParseCsvOptions, ParseCsvStreamBatchesOptions, ParseMeta, ParseResults } from '../src/types';
import { getXataClientWithPlugin, yepNopeToBoolean } from './utils';

const ONE_DECIMAL_PLACE = 1;
const BOM_CHAR = '\uFEFF';

const xata = getXataClientWithPlugin();

const stringToStream = (str: string) => {
  const stream = new Readable();
  stream.push(str);
  stream.push(null);
  return stream;
};

const defaultMeta = { delimiter: ',', estimatedProgress: 1, linebreak: '\n' };
type CommonTestCase = {
  name: string;
  fileContents: string;
  options?: ParseCsvOptions;
  expected: CsvResults;
};
const commonTestCases: CommonTestCase[] = [
  {
    name: 'simple',
    fileContents: 'name\nXata',
    expected: {
      results: {
        success: true,
        columns: [{ name: 'name', type: 'string' }],
        warnings: ["Unable to auto-detect delimiting character; defaulted to ','"],
        data: [{ name: 'Xata' }]
      },
      meta: {
        ...defaultMeta,
        fields: ['name']
      }
    }
  },
  {
    name: 'simple with schema',
    fileContents: 'name\nXata',
    options: { columns: [{ name: 'name', type: 'text' }] },
    expected: {
      results: {
        success: true,
        columns: [{ name: 'name', type: 'text' }],
        warnings: ["Unable to auto-detect delimiting character; defaulted to ','"],
        data: [{ name: 'Xata' }]
      },
      meta: {
        ...defaultMeta,
        fields: ['name']
      }
    }
  },
  {
    name: 'multiple',
    fileContents: 'name,dob\nXata,2019-01-01',
    expected: {
      results: {
        success: true,
        columns: [
          { name: 'name', type: 'string' },
          { name: 'dob', type: 'datetime' }
        ],
        warnings: [],
        data: [{ name: 'Xata', dob: new Date('2019-01-01T00:00:00.000Z') }]
      },
      meta: {
        ...defaultMeta,
        fields: ['name', 'dob']
      }
    }
  },
  {
    name: 'booleans',
    fileContents: 'boolean_1\nT\nF',
    expected: {
      results: {
        success: true,
        columns: [{ name: 'boolean_1', type: 'bool' }],
        warnings: ["Unable to auto-detect delimiting character; defaulted to ','"],
        data: [{ boolean_1: true }, { boolean_1: false }]
      },
      meta: {
        ...defaultMeta,
        fields: ['boolean_1']
      }
    }
  },
  {
    name: 'booleans custom',
    fileContents: 'boolean\nyep\nnope',
    options: { toBoolean: yepNopeToBoolean },
    expected: {
      results: {
        success: true,
        columns: [{ name: 'boolean', type: 'bool' }],
        warnings: ["Unable to auto-detect delimiting character; defaulted to ','"],
        data: [{ boolean: true }, { boolean: false }]
      },
      meta: {
        ...defaultMeta,
        fields: ['boolean']
      }
    }
  },
  {
    name: 'booleans as string',
    fileContents: 'boolean_1\nT\nF',
    options: { columns: [{ name: 'boolean_1', type: 'string' }] },
    expected: {
      results: {
        success: true,
        columns: [{ name: 'boolean_1', type: 'string' }],
        warnings: ["Unable to auto-detect delimiting character; defaulted to ','"],
        data: [{ boolean_1: 'T' }, { boolean_1: 'F' }]
      },
      meta: {
        ...defaultMeta,
        fields: ['boolean_1']
      }
    }
  },
  {
    name: 'semicolon delimited',
    fileContents: 'boolean_1;string_1\nT;something\nF;else',
    expected: {
      results: {
        success: true,
        columns: [
          { name: 'boolean_1', type: 'bool' },
          { name: 'string_1', type: 'string' }
        ],
        warnings: [],
        data: [
          { boolean_1: true, string_1: 'something' },
          { boolean_1: false, string_1: 'else' }
        ]
      },
      meta: {
        ...defaultMeta,
        delimiter: ';',
        fields: ['boolean_1', 'string_1']
      }
    }
  },
  {
    name: '\\r\\n linebreaks',
    fileContents: 'boolean_1,string_1\r\nT,something\r\nF,else',
    expected: {
      results: {
        success: true,
        columns: [
          { name: 'boolean_1', type: 'bool' },
          { name: 'string_1', type: 'string' }
        ],
        warnings: [],
        data: [
          { boolean_1: true, string_1: 'something' },
          { boolean_1: false, string_1: 'else' }
        ]
      },
      meta: {
        ...defaultMeta,
        linebreak: '\r\n',
        fields: ['boolean_1', 'string_1']
      }
    }
  },
  {
    name: 'no header',
    fileContents: 'T,something\nF,else',
    options: { header: false },
    expected: {
      results: {
        success: true,
        columns: [
          { name: '0', type: 'bool' },
          { name: '1', type: 'string' }
        ],
        warnings: [],
        data: [
          { 0: true, 1: 'something' },
          { 0: false, 1: 'else' }
        ]
      },
      meta: {
        ...defaultMeta,
        fields: undefined
      }
    }
  },
  {
    name: 'skips empty lines',
    fileContents: 'boolean_1\nT\n\n\nF\n\n\n\n',
    expected: {
      results: {
        success: true,
        columns: [{ name: 'boolean_1', type: 'bool' }],
        warnings: ["Unable to auto-detect delimiting character; defaulted to ','"],
        data: [{ boolean_1: true }, { boolean_1: false }]
      },
      meta: {
        ...defaultMeta,
        fields: ['boolean_1']
      }
    }
  },
  {
    name: 'does not skip empty lines',
    fileContents: 'boolean_1\nT\n\nF\n',
    options: { skipEmptyLines: false },
    expected: {
      results: {
        success: true,
        columns: [{ name: 'boolean_1', type: 'bool' }],
        warnings: ["Unable to auto-detect delimiting character; defaulted to ','"],
        data: [{ boolean_1: true }, { boolean_1: null }, { boolean_1: false }]
      },
      meta: {
        ...defaultMeta,
        fields: ['boolean_1']
      }
    }
  },
  {
    name: 'with quotes',
    fileContents: '"boolean_1","string_1"\n"T","something"\n"F","else"',
    expected: {
      results: {
        success: true,
        columns: [
          { name: 'boolean_1', type: 'bool' },
          { name: 'string_1', type: 'string' }
        ],
        warnings: [],
        data: [
          { boolean_1: true, string_1: 'something' },
          { boolean_1: false, string_1: 'else' }
        ]
      },
      meta: {
        ...defaultMeta,
        fields: ['boolean_1', 'string_1']
      }
    }
  },
  {
    name: 'escape quotes',
    fileContents: '"boolean_1","string_1"\n"T","something"""\n"F","""else"',
    expected: {
      results: {
        success: true,
        columns: [
          { name: 'boolean_1', type: 'bool' },
          { name: 'string_1', type: 'string' }
        ],
        warnings: [],
        data: [
          { boolean_1: true, string_1: 'something"' },
          { boolean_1: false, string_1: '"else' }
        ]
      },
      meta: {
        ...defaultMeta,
        fields: ['boolean_1', 'string_1']
      }
    }
  },
  {
    name: 'with limit',
    fileContents: '"boolean_1","string_1"\n"T","something"\n"F","else"',
    options: { limit: 1 },
    expected: {
      results: {
        success: true,
        columns: [
          { name: 'boolean_1', type: 'bool' },
          { name: 'string_1', type: 'string' }
        ],
        warnings: [],
        data: [{ boolean_1: true, string_1: 'something' }]
      },
      meta: {
        ...defaultMeta,
        fields: ['boolean_1', 'string_1']
      }
    }
  },
  {
    name: 'null values',
    fileContents: '"boolean_1","string_1"\n"T","null"\n"F","else"',
    expected: {
      results: {
        success: true,
        columns: [
          { name: 'boolean_1', type: 'bool' },
          { name: 'string_1', type: 'string' }
        ],
        warnings: [],
        data: [
          { boolean_1: true, string_1: null },
          { boolean_1: false, string_1: 'else' }
        ]
      },
      meta: {
        ...defaultMeta,
        fields: ['boolean_1', 'string_1']
      }
    }
  },
  {
    name: 'custom null values',
    fileContents: '"boolean_1","string_1"\n"T","nil"\n"F","null"',
    options: { isNull: (value) => value === 'nil' },
    expected: {
      results: {
        success: true,
        columns: [
          { name: 'boolean_1', type: 'bool' },
          { name: 'string_1', type: 'string' }
        ],
        warnings: [],
        data: [
          { boolean_1: true, string_1: null },
          { boolean_1: false, string_1: 'null' }
        ]
      },
      meta: {
        ...defaultMeta,
        fields: ['boolean_1', 'string_1']
      }
    }
  },
  {
    name: 'ignores columns',
    fileContents: '"boolean_1","string_1"\n"T","something"\n"F","else"',
    options: { columns: [{ name: 'boolean_1', type: 'bool' }] },
    expected: {
      results: {
        success: true,
        columns: [{ name: 'boolean_1', type: 'bool' }],
        warnings: [],
        data: [{ boolean_1: true }, { boolean_1: false }]
      },
      meta: {
        ...defaultMeta,
        fields: ['boolean_1', 'string_1']
      }
    }
  }
];

const parseCsvStreamTestCases: {
  name: string;
  fileContents: string;
  options?: ParseCsvOptions;
  expected: CsvResults;
}[] = [
  ...commonTestCases,
  {
    name: 'empty',
    fileContents: '',
    expected: {
      results: {
        success: true,
        columns: [],
        warnings: ["Unable to auto-detect delimiting character; defaulted to ','"],
        data: []
      },
      meta: {
        ...defaultMeta,
        fields: []
      }
    }
  },
  {
    name: 'warns for malformed data',
    fileContents: '"boolean_1,"string_1"\n"T","something"\n"F","else"',
    options: { columns: [{ name: 'boolean_1', type: 'bool' }] },
    expected: {
      results: {
        success: true,
        columns: [{ name: 'boolean_1', type: 'bool' }],
        warnings: [
          'Trailing quote on quoted field is malformed',
          "Unable to auto-detect delimiting character; defaulted to ','",
          'Too many fields: expected 1 fields but parsed 2',
          'Too many fields: expected 1 fields but parsed 2'
        ],
        data: [{ boolean_1: null }, { boolean_1: null }]
      },
      meta: {
        ...defaultMeta,
        fields: ['boolean_1,"string_1']
      }
    }
  },
  {
    name: 'removes unprintable BOM characters',
    fileContents: `${BOM_CHAR}name,dob\nXata,2019-01-01`,
    expected: {
      results: {
        success: true,
        columns: [
          { name: 'name', type: 'string' },
          { name: 'dob', type: 'datetime' }
        ],
        warnings: [],
        data: [{ name: 'Xata', dob: new Date('2019-01-01T00:00:00.000Z') }]
      },
      meta: {
        ...defaultMeta,
        fields: ['name', 'dob']
      }
    }
  }
];

describe('parseCsvStream', () => {
  for (const { name, fileContents, options, expected } of parseCsvStreamTestCases) {
    test(name, async () => {
      const result = await xata.import.parseCsvStream({
        fileStream: stringToStream(fileContents),
        parserOptions: options ?? {}
      });
      expect(result).toEqual(expected);
    });
  }
});

describe('parseCsvStreamBatches', () => {
  describe('same results as parseCsvStream', () => {
    for (const { name, fileContents, options, expected } of commonTestCases) {
      test(name, async () => {
        let columns = options?.columns;
        if (!columns) {
          const parsed = await xata.import.parseCsvStream({
            fileStream: stringToStream(fileContents),
            parserOptions: options ?? {}
          });
          if (!parsed.results.success) {
            throw new Error('parseCsvStream failed');
          }
          columns = parsed.results.columns;
        }

        const result = { results: { success: true } } as CsvResults;
        await xata.import.parseCsvStreamBatches({
          fileStream: stringToStream(fileContents),
          fileSizeBytes: new TextEncoder().encode(fileContents).length,
          batchRowCount: 2,
          batchSizeMin: 1,
          concurrentBatchMax: 1,
          onBatch: async (batch, meta) => {
            if (!batch.success) {
              throw new Error('parseCsvStreamBatches failed');
            }
            if (result.results.success) {
              if (!result.results.columns) {
                result.results.columns = batch.columns;
              }
              result.results.data = [...(result.results.data ?? []), ...batch.data];
              result.results.warnings = [...(result.results.warnings ?? []), ...batch.warnings];
            }
            if (isNil(result?.meta?.estimatedProgress) || meta.estimatedProgress > result.meta.estimatedProgress) {
              result.meta = meta;
            }
          },
          parserOptions: { columns, ...(options ?? {}) }
        });
        expect(result).toEqual(expected);
      });
    }
  });
  const row = `T;something\n`;
  const parseCsvStreamBatchTestCases: {
    name: string;
    fileContents: string;
    options?: ParseCsvStreamBatchesOptions;
    expectedMeta: ParseMeta[];
  }[] = [
    {
      name: 'small batches',
      fileContents: `boolean_1;string_1\n${row.repeat(4)}`,
      options: { batchRowCount: 2, batchSizeMin: 2, concurrentBatchMax: 1 } as ParseCsvStreamBatchesOptions,
      expectedMeta: [
        { delimiter: ';', estimatedProgress: 0.5, fields: ['boolean_1', 'string_1'], linebreak: '\n' },
        { delimiter: ';', estimatedProgress: 1, fields: ['boolean_1', 'string_1'], linebreak: '\n' }
      ]
    },
    {
      name: 'default settings',
      fileContents: `boolean_1;string_1\n${row.repeat(1500)}`,
      options: { concurrentBatchMax: 1 } as ParseCsvStreamBatchesOptions,
      expectedMeta: [
        { delimiter: ';', estimatedProgress: 0.66, fields: ['boolean_1', 'string_1'], linebreak: '\n' },
        { delimiter: ';', estimatedProgress: 1, fields: ['boolean_1', 'string_1'], linebreak: '\n' }
      ]
    }
  ];
  describe('onBatch', () => {
    for (const { name, fileContents, options, expectedMeta } of parseCsvStreamBatchTestCases) {
      test(name, async () => {
        const parsed = await xata.import.parseCsvStream({
          fileStream: stringToStream(fileContents),
          parserOptions: options?.parserOptions ?? {}
        });
        if (!parsed.results.success) {
          throw new Error('parseCsvStream failed');
        }
        const batches: { batch: ParseResults; meta: ParseMeta }[] = [];
        await xata.import.parseCsvStreamBatches({
          fileStream: stringToStream(fileContents),
          fileSizeBytes: new TextEncoder().encode(fileContents).length,
          ...options,
          onBatch: async (batch, meta) => {
            if (!batch.success) {
              throw new Error('parseCsvStreamBatches failed');
            }
            batches.push({ batch, meta });
            // batches order isn't deterministic, so sort by estimatedProgress
            batches.sort((a, b) => a.meta.estimatedProgress - b.meta.estimatedProgress);
          },
          parserOptions: { columns: parsed.results.columns, ...(options?.parserOptions ?? {}) }
        });
        if (expectedMeta) {
          expect(expectedMeta.map((meta) => omit(meta, 'estimatedProgress'))).toEqual(
            batches.map((b) => omit(b.meta, 'estimatedProgress'))
          );
          for (const i in expectedMeta) {
            expect(expectedMeta[i].estimatedProgress).toBeCloseTo(batches[i].meta.estimatedProgress, ONE_DECIMAL_PLACE);
          }
        }
      });
    }
  });
});
