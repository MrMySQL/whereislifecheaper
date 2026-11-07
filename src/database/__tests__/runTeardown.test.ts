import { runTeardown } from './isolatedDatabase';

describe('runTeardown', () => {
  test('runs the drop even when an earlier step throws, then rethrows the first error', async () => {
    const order: string[] = [];
    const drop = jest.fn(async () => { order.push('drop'); });
    await expect(runTeardown([
      async () => { order.push('closePool'); throw new Error('pool already closed'); },
      async () => { order.push('client'); throw new Error('second failure'); },
      drop,
    ])).rejects.toThrow('pool already closed');
    expect(order).toEqual(['closePool', 'client', 'drop']);
  });

  test('skips steps that were never set because beforeAll failed early', async () => {
    const drop = jest.fn(async () => undefined);
    await expect(runTeardown([undefined, undefined, drop])).resolves.toBeUndefined();
    expect(drop).toHaveBeenCalledTimes(1);
  });
});
