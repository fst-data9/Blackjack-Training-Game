import { Worker } from 'node:worker_threads';
import { randomBytes, randomUUID } from 'node:crypto';
import { ENGINE_VERSION, validateConfig } from './simulation-engine.js';

export function runSimulation(config, seed, signal) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./simulation-worker.js', import.meta.url), { workerData: { config, seed }, resourceLimits: { maxOldGenerationSizeMb: 64 } });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      // Keep the concurrency slot until the worker is actually stopped.
      worker.terminate().finally(() => error ? reject(error) : resolve(result));
    };
    const abort = () => finish(new Error('Simulation cancelled'));
    const timer = setTimeout(() => finish(new Error('Simulation timed out')), 20000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.once('message', result => finish(null, result));
    worker.once('error', finish);
    worker.once('exit', () => { if (!settled) finish(new Error('Simulation worker stopped')); });
    if (signal?.aborted) abort();
  });
}

export function registerSimulationRoutes(app, { pool, authenticateOptional, run = runSimulation }) {
  let active = 0;
  const buckets = new Map();
  app.post('/api/simulations', authenticateOptional, async (req, res, next) => {
    let config;
    try { config = validateConfig(req.body); } catch { return res.status(400).json({ error: 'Invalid simulation settings' }); }
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.reset <= now) buckets.delete(key);
    const key = req.ip;
    const bucket = buckets.get(key) || { count: 0, reset: now + 60000 };
    if (bucket.count >= 3 || (!buckets.has(key) && buckets.size >= 10000)) {
      return res.set('Retry-After', '60').status(429).json({ error: 'Please wait a minute before running another simulation.' });
    }
    if (active >= 2) return res.set('Retry-After', '5').status(503).json({ error: 'Simulation servers are busy. Please try again shortly.' });
    bucket.count++; buckets.set(key, bucket); active++;
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', cancel);
    try {
      const id = randomUUID();
      const seed = randomBytes(4).readUInt32LE();
      const result = await run(config, seed, controller.signal);
      if (controller.signal.aborted) return;
      await pool.query(`INSERT INTO simulation_runs (id, user_id, engine_version, seed, settings, results)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
      [id, req.user?.id || null, ENGINE_VERSION, seed, JSON.stringify(config), JSON.stringify(result)]);
      res.status(201).json({ id, engineVersion: ENGINE_VERSION, seed, config, result });
    } catch (error) { if (!controller.signal.aborted) next(error); }
    finally { active--; res.removeListener('close', cancel); }
  });
}
