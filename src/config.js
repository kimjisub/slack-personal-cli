const RUNTIME_FLAGS = new Set(["--no-cache", "--refresh", "--debug-cache", "--debug-queue", "--read-only"]);
const FREE_FORM_COMMANDS = new Set(["send", "s", "search", "draft"]);

function splitTrailingRuntimeFlags(args, runtimeFlags) {
  const commandArgs = [...args];

  while (commandArgs.length > 0 && RUNTIME_FLAGS.has(commandArgs.at(-1))) {
    runtimeFlags.unshift(commandArgs.pop());
  }

  return commandArgs;
}

export function splitCliArgs(argv = process.argv.slice(2)) {
  const runtimeFlags = [];
  let index = 0;

  while (index < argv.length && RUNTIME_FLAGS.has(argv[index])) {
    runtimeFlags.push(argv[index]);
    index += 1;
  }

  const command = argv[index];
  if (!command) {
    return {
      command: undefined,
      commandArgs: [],
      runtimeFlags,
    };
  }

  const rest = argv.slice(index + 1);
  if (FREE_FORM_COMMANDS.has(command)) {
    return {
      command,
      commandArgs: [command, ...splitTrailingRuntimeFlags(rest, runtimeFlags)],
      runtimeFlags,
    };
  }

  const commandArgs = [command];
  for (const arg of rest) {
    if (RUNTIME_FLAGS.has(arg)) runtimeFlags.push(arg);
    else commandArgs.push(arg);
  }

  return { command, commandArgs, runtimeFlags };
}

export function getRuntimeConfig(argv = process.argv.slice(2), env = process.env) {
  const { runtimeFlags } = splitCliArgs(argv);
  const hasFlag = (flag) => runtimeFlags.includes(flag);
  const numeric = (name, fallback) => {
    const value = Number(env[name]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };

  return {
    minRequestGapMs: numeric("SLK_MIN_REQUEST_GAP_MS", 1200),
    maxRetries: numeric("SLK_MAX_RETRIES", 3),
    retryJitterMs: numeric("SLK_RETRY_JITTER_MS", 250),
    lockTimeoutMs: numeric("SLK_LOCK_TIMEOUT_MS", 30000),
    staleLockMs: numeric("SLK_STALE_LOCK_MS", 120000),
    cacheEnabled: !hasFlag("--no-cache") && env.SLK_NO_CACHE !== "1",
    cacheRefresh: hasFlag("--refresh") || env.SLK_REFRESH === "1",
    cacheDebug: hasFlag("--debug-cache") || env.SLK_DEBUG_CACHE === "1",
    queueDebug: hasFlag("--debug-queue") || env.SLK_DEBUG_QUEUE === "1",
    readOnly: hasFlag("--read-only") || env.SLK_READ_ONLY === "1",
    stateRootDir: env.SLK_STATE_ROOT_DIR || null,
  };
}
