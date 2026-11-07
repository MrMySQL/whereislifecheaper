import TransportStream from 'winston-transport';
import { randomBytes } from 'crypto';

/**
 * Winston transport that writes Google Cloud Logging structured-JSON lines to
 * stdout - the same lines `@google-cloud/logging-winston` writes with
 * `redirectToStdout: true, useMessageField: false`, which is how the logger ran
 * on serverless.
 *
 * It exists so the Vercel function does not ship that library: on the stdout
 * path the library only formats JSON, yet it pulls in google-gax, gRPC,
 * protobufjs and google-auth-library - over half the files @vercel/node traces
 * and packages on every deploy. The library is still used, lazily, for the
 * direct gRPC path off serverless.
 *
 * Two deliberate differences: the library's one-time "diagnostic" entry (its
 * own version telemetry) is not reproduced, and an entry whose metadata cannot
 * be serialised is replaced by a WARNING line instead of vanishing silently.
 * cloudLoggingStdout.test.ts runs the library and this transport
 * on the same calls and compares the output.
 */

const LEVEL = Symbol.for('level');

const TRACE_KEY = 'logging.googleapis.com/trace';
const SPAN_ID_KEY = 'logging.googleapis.com/spanId';
const TRACE_SAMPLED_KEY = 'logging.googleapis.com/trace_sampled';
const LABELS_KEY = 'logging.googleapis.com/labels';
const INSERT_ID_KEY = 'logging.googleapis.com/insertId';

/** npm level -> Cloud Logging severity, as @google-cloud/logging-winston maps them. */
const SEVERITY: Record<string, string> = {
  error: 'ERROR',
  warn: 'WARNING',
  info: 'INFO',
  http: 'INFO',
  verbose: 'DEBUG',
  debug: 'DEBUG',
  silly: 'DEBUG',
};

export interface CloudLoggingStdoutOptions {
  projectId: string;
  logName: string;
  labels?: Record<string, string>;
  /** Where lines go; stdout by default. */
  write?: (line: string) => void;
}

/** Unique, increasing within a process: insertId orders same-millisecond entries. */
const insertIdPrefix = randomBytes(9).toString('base64url');
let insertIdCounter = 0;
const nextInsertId = () => `${insertIdPrefix}${(insertIdCounter++).toString(36).padStart(8, '0')}`;

function formatLogName(projectId: string, name: string): string {
  const prefix = `projects/${projectId}/logs/`;
  name = name.replace(prefix, '');
  if (decodeURIComponent(name) === name) name = encodeURIComponent(name);
  return prefix + name;
}

function toSecondsAndNanos(date: Date) {
  const seconds = date.getTime() / 1000;
  const secondsRounded = Math.floor(seconds);
  return { seconds: secondsRounded, nanos: Math.floor((seconds - secondsRounded) * 1e9) };
}

export class CloudLoggingStdout extends TransportStream {
  private readonly logName: string;
  private readonly labels?: Record<string, string>;
  private readonly writeLine: (line: string) => void;

  constructor(options: CloudLoggingStdoutOptions) {
    super();
    this.logName = formatLogName(options.projectId, options.logName);
    this.labels = options.labels;
    this.writeLine = options.write ?? ((line) => process.stdout.write(line));
  }

  log(info: Record<string | symbol, any>, callback: () => void): void {
    // An unknown level throws from toEntry, as it does in the library.
    const entry = this.toEntry(info);
    let line: string;
    try {
      line = JSON.stringify(entry);
    } catch {
      // Unserialisable metadata (e.g. circular): the entry is dropped, as the
      // library does - but not silently.
      line = JSON.stringify({
        severity: 'WARNING',
        [LABELS_KEY]: entry[LABELS_KEY],
        [INSERT_ID_KEY]: entry[INSERT_ID_KEY],
        message: `Dropped a ${String(entry.severity)} log entry whose metadata could not be serialised: ${String(entry.message).slice(0, 500)}`,
        timestamp: entry.timestamp,
        logName: entry.logName,
      });
    }
    this.writeLine(line + '\n');
    callback();
  }

  private toEntry(info: Record<string | symbol, any>): Record<string, unknown> {
    const { message: rawMessage, level, splat: _splat, stack, ...metadata } = info;
    if (stack) metadata.stack = stack;

    const severity = SEVERITY[info[LEVEL] ?? level];
    if (!severity) throw new Error(`Unknown log level: ${String(info[LEVEL] ?? level)}`);

    // Error Reporting reads the stack from the message.
    let message: string = rawMessage || '';
    if (metadata.stack) message += (message ? ' ' : '') + metadata.stack;

    const timestamp = metadata.timestamp instanceof Date ? metadata.timestamp : new Date();
    const labels = this.labels || metadata.labels ? { ...this.labels, ...metadata.labels } : undefined;
    const trace = metadata[TRACE_KEY];
    const spanId = metadata[SPAN_ID_KEY];
    const traceSampled = TRACE_SAMPLED_KEY in metadata ? metadata[TRACE_SAMPLED_KEY] === true : undefined;
    const httpRequest = metadata.httpRequest;

    // Promoted to the entry, so not repeated under `metadata`.
    for (const key of [TRACE_KEY, SPAN_ID_KEY, TRACE_SAMPLED_KEY, 'httpRequest', 'labels', 'timestamp', 'logName']) {
      delete metadata[key];
    }

    return {
      severity,
      httpRequest,
      [LABELS_KEY]: labels,
      [INSERT_ID_KEY]: nextInsertId(),
      [TRACE_KEY]: trace || undefined,
      [SPAN_ID_KEY]: spanId || undefined,
      [TRACE_SAMPLED_KEY]: traceSampled,
      message,
      metadata,
      timestamp: toSecondsAndNanos(timestamp),
      logName: this.logName,
    };
  }
}
