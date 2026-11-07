import winston from 'winston';
import { LoggingWinston } from '@google-cloud/logging-winston';
import { CloudLoggingStdout } from '../cloudLoggingStdout';

/**
 * CloudLoggingStdout replaces @google-cloud/logging-winston's stdout mode on
 * serverless, where a log drain may forward the lines to Cloud Logging. Its
 * output has to stay what the library writes, so every case here runs through
 * both and the parsed lines are compared.
 */

// Same format chain as src/utils/logger.ts.
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const options = {
  projectId: 'whereislifecheaper',
  logName: 'whereislifecheaper-api',
  labels: { app: 'whereislifecheaper', component: 'api', environment: 'vercel' },
};

type Emit = (logger: winston.Logger) => void;

// Created once so both runs log the same stack.
const boom = new Error('boom');
const bare = new Error('bare');

const cases: Array<[string, Emit]> = [
  ['plain message', (l) => l.info('Starting database migrations...')],
  ['metadata object', (l) => l.info('with meta', { a: 1, nested: { b: [1, 2] }, when: new Date(0) })],
  ['splat', (l) => l.info('hello %s, you are %d', 'world', 42)],
  ['prefixed scraper meta', (l) => l.warn('Slow page', { prefix: 'Migros', ms: 1234 })],
  ['per-entry labels merge with the transport labels', (l) => l.info('labelled', { labels: { extra: 'x', component: 'override' } })],
  ['error with message', (l) => l.error('API Error:', boom)],
  ['bare error', (l) => l.error(bare)],
  ['debug, verbose, http, silly severities', (l) => { l.debug('d'); l.verbose('v'); l.http('h'); l.silly('s'); }],
  ['trace keys are promoted', (l) => l.info('traced', {
    'logging.googleapis.com/trace': 'projects/p/traces/abc',
    'logging.googleapis.com/spanId': '000000000000004a',
    'logging.googleapis.com/trace_sampled': true,
  })],
  ['httpRequest and logName are promoted', (l) => l.info('req', { httpRequest: { requestMethod: 'GET', status: 200 }, logName: 'ignored' })],
  ['empty message', (l) => l.info('')],
];

async function capture(transport: winston.transport, emit: Emit): Promise<Record<string, unknown>[]> {
  const lines: string[] = [];
  const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
    lines.push(String(chunk));
    return true;
  });
  try {
    const logger = winston.createLogger({ level: 'silly', format, transports: [transport] });
    emit(logger);
    await new Promise((resolve) => setImmediate(resolve));
    logger.close();
  } finally {
    spy.mockRestore();
  }
  return lines
    .join('')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    // The library's one-off self-telemetry entry, deliberately not reproduced.
    .filter((entry) => !('logging.googleapis.com/diagnostic' in entry));
}

/** insertId and timestamp legitimately differ between runs: check their shape, then drop them. */
function normalise(entry: Record<string, any>) {
  const { 'logging.googleapis.com/insertId': insertId, timestamp, ...rest } = entry;
  expect(typeof insertId).toBe('string');
  expect(Number.isInteger(timestamp.seconds)).toBe(true);
  expect(Number.isInteger(timestamp.nanos)).toBe(true);
  expect(Math.abs(timestamp.seconds - Date.now() / 1000)).toBeLessThan(60);
  return rest;
}

describe('CloudLoggingStdout matches @google-cloud/logging-winston redirectToStdout', () => {
  test.each(cases)('%s', async (_name, emit) => {
    const expected = await capture(
      new LoggingWinston({ ...options, redirectToStdout: true, useMessageField: false }),
      emit
    );
    const actual = await capture(new CloudLoggingStdout(options), emit);

    expect(actual.length).toBeGreaterThan(0);
    expect(actual.map(normalise)).toEqual(expected.map(normalise));
  });

  test('insertIds are unique and increase', async () => {
    const entries = await capture(new CloudLoggingStdout(options), (l) => {
      for (let i = 0; i < 50; i++) l.info(`line ${i}`);
    });
    const ids = entries.map((e) => e['logging.googleapis.com/insertId'] as string);
    expect(new Set(ids).size).toBe(50);
    expect([...ids].sort()).toEqual(ids);
  });

  test('an entry with unserialisable metadata is replaced by a warning, not lost silently', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const entries = await capture(new CloudLoggingStdout(options), (l) => {
      l.error('circular', { circular });
      l.info('after');
    });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      severity: 'WARNING',
      'logging.googleapis.com/labels': options.labels,
      logName: 'projects/whereislifecheaper/logs/whereislifecheaper-api',
    });
    expect(entries[0].message).toMatch(/^Dropped a ERROR log entry .*: circular$/);
    expect(entries[1].message).toBe('after');
  });

  test('an unknown level throws, as in the library', () => {
    const transport = new CloudLoggingStdout({ ...options, write: () => undefined });
    expect(() => transport.log({ level: 'fatal', message: 'x', [Symbol.for('level')]: 'fatal' }, () => undefined))
      .toThrow('Unknown log level: fatal');
  });
});
