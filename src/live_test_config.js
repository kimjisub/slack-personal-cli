export function getLiveTestConfig(env = process.env) {
  const enabled = env.SLK_LIVE_TESTS === '1';
  if (!enabled) {
    return {
      enabled: false,
      allowWrite: false,
      reason: 'Set SLK_LIVE_TESTS=1 to enable live Slack integration tests.',
      readTargets: { channel: null, messageTs: null, missing: [] },
      writeTargets: { threadTs: null, missing: [] },
    };
  }

  const channel = env.SLK_LIVE_CHANNEL || null;
  const messageTs = env.SLK_LIVE_MESSAGE_TS || null;
  const threadTs = env.SLK_LIVE_THREAD_TS || null;
  const allowWrite = env.SLK_LIVE_ALLOW_WRITE === '1';

  const readMissing = [];
  if (!channel) readMissing.push('SLK_LIVE_CHANNEL');
  if (!messageTs) readMissing.push('SLK_LIVE_MESSAGE_TS');

  const writeMissing = [];
  if (allowWrite && !threadTs) writeMissing.push('SLK_LIVE_THREAD_TS');

  return {
    enabled: true,
    allowWrite,
    reason: null,
    readTargets: {
      channel,
      messageTs,
      missing: readMissing,
    },
    writeTargets: {
      threadTs,
      missing: writeMissing,
    },
  };
}
