import { Client } from 'pg';
import { DATABASE_SSL, DATABASE_URL, SINGLE_INSTANCE_LOCK_ID } from './config';

export interface SingleInstanceLease {
  readonly lockId: number;
  isHeld(): boolean;
  release(): Promise<void>;
}

export async function acquireSingleInstanceLease(
  onLeaseLost: (err: Error) => void,
): Promise<SingleInstanceLease> {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_SSL,
  });

  let released = false;
  let held = false;

  client.on('error', (err) => {
    if (!released && held) {
      held = false;
      onLeaseLost(new Error(`Single-instance lease connection lost: ${err.message}`));
    }
  });

  await client.connect();

  const result = await client.query<{ locked: boolean }>(
    'SELECT pg_try_advisory_lock($1) AS locked',
    [SINGLE_INSTANCE_LOCK_ID],
  );

  if (!result.rows[0]?.locked) {
    await client.end().catch(() => {});
    throw new Error(
      `Another server instance is already active for this database (lock ${SINGLE_INSTANCE_LOCK_ID})`,
    );
  }

  held = true;

  return {
    lockId: SINGLE_INSTANCE_LOCK_ID,
    isHeld: () => held,
    release: async () => {
      if (released) return;
      released = true;

      try {
        if (held) {
          await client.query('SELECT pg_advisory_unlock($1)', [SINGLE_INSTANCE_LOCK_ID]).catch(() => {});
          held = false;
        }
      } finally {
        await client.end().catch(() => {});
      }
    },
  };
}
