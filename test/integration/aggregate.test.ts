import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { XataClient } from '../../packages/codegen/example/xata';
import { setUpTestEnvironment, TestEnvironmentResult } from '../utils/setup';

let xata: XataClient;
let hooks: TestEnvironmentResult['hooks'];

const teams = [
  {
    name: 'r1',
    email: 'r1+1@a.com',
    settings: {
      plan: 'free',
      dark: true,
      labels: ['label1', 'label2']
    },
    description: 'longer text goes here',
    index: 6,
    rating: 1,
    founded_date: new Date('2022-01-01T09:00:00.000Z')
  },
  {
    name: 'r1',
    email: 'r1+2@a.com',
    settings: {
      plan: 'free',
      dark: false,
      labels: ['label1', 'label2']
    },
    description: 'longer text goes here',
    index: 8,
    rating: 2.2,
    founded_date: new Date('2022-01-01T18:00:00.000Z')
  },
  {
    name: 'r2',
    email: 'r2+1@b.com',
    settings: {
      plan: 'paid',
      dark: true,
      labels: ['label2', 'label3']
    },
    description: 'longer text goes here',
    index: 3,
    rating: 3.1,
    founded_date: new Date('2022-01-05T09:00:00.000Z')
  },
  {
    name: 'r2',
    email: 'r2+2@b.com',
    settings: {
      plan: 'paid',
      dark: false,
      labels: ['label2', 'label3']
    },
    description: 'longer text goes here',
    index: 2,
    rating: 4,
    founded_date: new Date('2022-01-05T18:00:00.000Z')
  },
  {
    name: 'r3',
    email: 'r3@b.com',
    settings: {
      plan: 'free',
      dark: true,
      labels: ['label5', 'label6']
    },
    description: 'longer text goes here',
    index: 12,
    rating: 5.3,
    founded_date: new Date('2022-01-10T09:00:00.000Z')
  }
];

beforeAll(async (ctx) => {
  const result = await setUpTestEnvironment('aggregate');

  xata = result.client;
  hooks = result.hooks;

  await hooks.beforeAll(ctx);

  await xata.db.teams.create(teams);

  await waitForSearchIndexing();
});

afterAll(async (ctx) => {
  await hooks.afterAll(ctx);
});

beforeEach(async (ctx) => {
  await hooks.beforeEach(ctx);
});

afterEach(async (ctx) => {
  await hooks.afterEach(ctx);
});

describe('aggregate', () => {
  test('no body', async () => {
    const result = await xata.db.teams.aggregate();
    expect(result.aggs.count).toBeCloseTo(5);
  });

  test('simple total and unique counts', async () => {
    const result = await xata.db.teams.aggregate({
      total: { count: '*' },
      unique: { uniqueCount: { column: 'name' } }
    });

    expect(result.aggs.total).toBeCloseTo(5);
    expect(result.aggs.unique).toBeCloseTo(3);
  });

  test('count and unique count with global filter', async () => {
    const result = await xata.db.teams.aggregate(
      {
        total: { count: '*' },
        unique: { uniqueCount: { column: 'name' } }
      },
      { 'settings.plan': 'free' }
    );

    expect(result.aggs.total).toBeCloseTo(3);
    expect(result.aggs.unique).toBeCloseTo(2);
  });

  test('counts with filters', async () => {
    const result = await xata.db.teams.aggregate({
      freeCount: { count: { filter: { 'settings.plan': 'free' } } },
      paidCount: { count: { filter: { 'settings.plan': 'paid' } } }
    });

    expect(result.aggs.freeCount).toBeCloseTo(3);
    expect(result.aggs.paidCount).toBeCloseTo(2);
  });

  test('numeric stats', async () => {
    const result = await xata.db.teams.aggregate({
      sumIndex: { sum: { column: 'index' } },
      sumRating: { sum: { column: 'rating' } },
      maxIndex: { max: { column: 'index' } },
      maxRating: { max: { column: 'rating' } },
      minIndex: { min: { column: 'index' } },
      minRating: { min: { column: 'rating' } },
      averageIndex: { average: { column: 'index' } },
      averageRating: { average: { column: 'rating' } }
    });

    expect(result.aggs.sumIndex).toBeCloseTo(31);
    expect(result.aggs.sumRating).toBeCloseTo(15.6);
    expect(result.aggs.maxIndex).toBeCloseTo(12);
    expect(result.aggs.maxRating).toBeCloseTo(5.3);
    expect(result.aggs.minIndex).toBeCloseTo(2);
    expect(result.aggs.minRating).toBeCloseTo(1);
    expect(result.aggs.averageIndex).toBeCloseTo(6.2);
    expect(result.aggs.averageRating).toBeCloseTo(3.12);
  });

  test('simple date histogram', async () => {
    const result = await xata.db.teams.aggregate({
      byDate: {
        dateHistogram: {
          column: 'founded_date',
          calendarInterval: 'week'
        }
      }
    });

    expect(result.aggs.byDate.values).toHaveLength(3);
    expect(result.aggs.byDate.values?.[0].$key).toBe('2021-12-27T00:00:00.000Z');
    expect(result.aggs.byDate.values?.[0].$count).toBeCloseTo(2);
    expect(result.aggs.byDate.values?.[1].$key).toBe('2022-01-03T00:00:00.000Z');
    expect(result.aggs.byDate.values?.[1].$count).toBeCloseTo(2);
    expect(result.aggs.byDate.values?.[2].$key).toBe('2022-01-10T00:00:00.000Z');
    expect(result.aggs.byDate.values?.[2].$count).toBeCloseTo(1);
  });

  test('date histogram with sub-aggs', async () => {
    const result = await xata.db.teams.aggregate({
      byDate: {
        dateHistogram: {
          column: 'founded_date',
          calendarInterval: 'week',
          aggs: {
            total: { count: '*' },
            unique: { uniqueCount: { column: 'name' } }
          }
        }
      }
    });

    expect(result.aggs.byDate.values).toHaveLength(3);
    expect(result.aggs.byDate.values?.[0].$key).toBe('2021-12-27T00:00:00.000Z');
    expect(result.aggs.byDate.values?.[0].$count).toBeCloseTo(2);
    expect(result.aggs.byDate.values?.[0].total).toBeCloseTo(2);
    expect(result.aggs.byDate.values?.[0].unique).toBeCloseTo(1);
    expect(result.aggs.byDate.values?.[1].$key).toBe('2022-01-03T00:00:00.000Z');
    expect(result.aggs.byDate.values?.[1].$count).toBeCloseTo(2);
    expect(result.aggs.byDate.values?.[1].total).toBeCloseTo(2);
    expect(result.aggs.byDate.values?.[1].unique).toBeCloseTo(1);
    expect(result.aggs.byDate.values?.[2].$key).toBe('2022-01-10T00:00:00.000Z');
    expect(result.aggs.byDate.values?.[2].$count).toBeCloseTo(1);
    expect(result.aggs.byDate.values?.[2].total).toBeCloseTo(1);
    expect(result.aggs.byDate.values?.[2].unique).toBeCloseTo(1);
  });

  test('simple top values aggregation', async () => {
    const result = await xata.db.teams.aggregate({
      topNames: { topValues: { column: 'name' } }
    });

    expect(result.aggs.topNames.values).toHaveLength(3);
    expect(result.aggs.topNames.values?.[0].$key).toBe('r1');
    expect(result.aggs.topNames.values?.[0].$count).toBeCloseTo(2);
    expect(result.aggs.topNames.values?.[1].$key).toBe('r2');
    expect(result.aggs.topNames.values?.[1].$count).toBeCloseTo(2);
    expect(result.aggs.topNames.values?.[2].$key).toBe('r3');
    expect(result.aggs.topNames.values?.[2].$count).toBeCloseTo(1);
  });

  test('top values aggregation with sub-aggs', async () => {
    const result = await xata.db.teams.aggregate({
      topNames: {
        topValues: {
          column: 'name',
          aggs: { maxRating: { max: { column: 'rating' } } }
        }
      }
    });

    expect(result.aggs.topNames.values).toHaveLength(3);
    expect(result.aggs.topNames.values?.[0].$key).toBe('r1');
    expect(result.aggs.topNames.values?.[0].$count).toBeCloseTo(2);
    expect(result.aggs.topNames.values?.[0].maxRating).toBeCloseTo(2.2);
    expect(result.aggs.topNames.values?.[1].$key).toBe('r2');
    expect(result.aggs.topNames.values?.[1].$count).toBeCloseTo(2);
    expect(result.aggs.topNames.values?.[1].maxRating).toBeCloseTo(4);
    expect(result.aggs.topNames.values?.[2].$key).toBe('r3');
    expect(result.aggs.topNames.values?.[2].$count).toBeCloseTo(1);
    expect(result.aggs.topNames.values?.[2].maxRating).toBeCloseTo(5.3);
  });

  test('date histogram combined with top values and sub-aggs', async () => {
    const result = await xata.db.teams.aggregate({
      byDate: {
        dateHistogram: {
          column: 'founded_date',
          calendarInterval: 'week',
          aggs: {
            topNames: {
              topValues: {
                column: 'name',
                aggs: { maxRating: { max: { column: 'rating' } } }
              }
            }
          }
        }
      }
    });

    expect(result.aggs.byDate.values).toHaveLength(3);
    expect(result.aggs.byDate.values?.[0].$key).toBe('2021-12-27T00:00:00.000Z');
    expect(result.aggs.byDate.values?.[0].$count).toBeCloseTo(2);
    expect(result.aggs.byDate.values?.[0].topNames.values).toHaveLength(1);
    expect(result.aggs.byDate.values?.[0].topNames.values?.[0].$key).toBe('r1');
    expect(result.aggs.byDate.values?.[0].topNames.values?.[0].$count).toBeCloseTo(2);
    expect(result.aggs.byDate.values?.[0].topNames.values?.[0].maxRating).toBeCloseTo(2.2);
    expect(result.aggs.byDate.values?.[1].$key).toBe('2022-01-03T00:00:00.000Z');
    expect(result.aggs.byDate.values?.[1].$count).toBeCloseTo(2);
    expect(result.aggs.byDate.values?.[1].topNames.values).toHaveLength(1);
    expect(result.aggs.byDate.values?.[1].topNames.values?.[0].$key).toBe('r2');
    expect(result.aggs.byDate.values?.[1].topNames.values?.[0].$count).toBeCloseTo(2);
    expect(result.aggs.byDate.values?.[1].topNames.values?.[0].maxRating).toBeCloseTo(4);
    expect(result.aggs.byDate.values?.[2].$key).toBe('2022-01-10T00:00:00.000Z');
    expect(result.aggs.byDate.values?.[2].$count).toBeCloseTo(1);
    expect(result.aggs.byDate.values?.[2].topNames.values).toHaveLength(1);
    expect(result.aggs.byDate.values?.[2].topNames.values?.[0].$key).toBe('r3');
    expect(result.aggs.byDate.values?.[2].topNames.values?.[0].$count).toBeCloseTo(1);
    expect(result.aggs.byDate.values?.[2].topNames.values?.[0].maxRating).toBeCloseTo(5.3);
  });

  test('numeric histogram combined with sub-aggs', async () => {
    const result = await xata.db.teams.aggregate({
      byIndex: {
        numericHistogram: {
          column: 'index',
          interval: 5,
          aggs: { avgRating: { average: { column: 'rating' } } }
        }
      }
    });

    expect(result.aggs.byIndex.values).toHaveLength(3);
    expect(result.aggs.byIndex.values?.[0].$key).toBeCloseTo(0);
    expect(result.aggs.byIndex.values?.[0].$count).toBeCloseTo(2);
    expect(result.aggs.byIndex.values?.[0].avgRating).toBeCloseTo(3.55);
    expect(result.aggs.byIndex.values?.[1].$key).toBeCloseTo(5);
    expect(result.aggs.byIndex.values?.[1].$count).toBeCloseTo(2);
    expect(result.aggs.byIndex.values?.[1].avgRating).toBeCloseTo(1.6);
    expect(result.aggs.byIndex.values?.[2].$key).toBeCloseTo(10);
    expect(result.aggs.byIndex.values?.[2].$count).toBeCloseTo(1);
    expect(result.aggs.byIndex.values?.[2].avgRating).toBeCloseTo(5.3);
  });
});

async function waitForSearchIndexing(): Promise<void> {
  const { aggs } = await xata.db.teams.aggregate({ total: { count: '*' } });
  if (aggs.total !== teams.length) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return waitForSearchIndexing();
  }
}
