import JSON from 'json5';
import CSV from 'papaparse';
import pick from 'lodash.pick';
import { coerceColumns, guessColumns } from './columns';
import { ParseCsvOptions, ParseJsonOptions, ParseNdJsonOptions, ParseResults } from './types';
import { detectNewline, isDefined, isObject } from './utils/lang';

export const DEFAULT_PARSE_SAMPLE_SIZE = 100;
export const DEFAULT_CSV_DELIMITERS_TO_GUESS = [',', '\t', '|', ';', '\x1E', '\x1F'];
export const DEFAULT_NULL_VALUES = [undefined, null, 'null', 'NULL', 'Null'];

export const parseCsvOptionsToPapaOptions = (options: Omit<ParseCsvOptions, 'data'>) => {
  const {
    limit,
    delimiter,
    header = true,
    skipEmptyLines = true,
    delimitersToGuess = DEFAULT_CSV_DELIMITERS_TO_GUESS,
    newline,
    quoteChar = '"',
    escapeChar = '"',
    commentPrefix
  } = options;
  return {
    header,
    skipEmptyLines,
    preview: limit,
    delimiter,
    delimitersToGuess,
    newline,
    quoteChar,
    escapeChar,
    comments: commentPrefix
  };
};

const dataForColumns = (data: unknown[], columns: ParseCsvOptions['columns']) => {
  if (!columns) {
    return data;
  }
  return data.map((d) =>
    pick(
      d,
      columns.map((col) => col.name)
    )
  );
};

export const papaResultToJson = (
  { data, errors }: CSV.ParseResult<unknown>,
  options: Omit<ParseCsvOptions, 'data'>
): ParseResults => {
  const { columns, limit, nullValues } = options;
  const parseWarnings = errors.map((error) => error.message);

  const jsonResults = parseJson({
    columns,
    limit,
    nullValues,
    data: dataForColumns(data, columns)
  });

  return jsonResults.success
    ? {
        ...jsonResults,
        warnings: [...parseWarnings, ...jsonResults.warnings]
      }
    : jsonResults;
};

export const parseCsv = (options: ParseCsvOptions): ParseResults => {
  const parseResult = CSV.parse(options.data, parseCsvOptionsToPapaOptions(options));
  return papaResultToJson(parseResult, options);
};

export const parseJson = (options: ParseJsonOptions): ParseResults => {
  const {
    data: input,
    columns: externalColumns,
    limit,
    nullValues = DEFAULT_NULL_VALUES //todo: do we need this?
  } = options;

  const array = Array.isArray(input) ? input : isObject(input) ? [input] : JSON.parse(input);

  const arrayUpToLimit = isDefined(limit) ? array.slice(0, limit) : array;
  const columns = externalColumns ?? guessColumns(arrayUpToLimit, nullValues);
  const data = coerceColumns(columns, arrayUpToLimit, nullValues);

  return { success: true, columns, warnings: [], data };
};
