// Enqueue AssetForge generation jobs and download GLBs into public/assets/.
// Usage: node scripts/forge_assets.mjs
// Requires AssetForge running on http://127.0.0.1:8000

import fs from 'node:fs/promises';
import path from 'node:path';

const FORGE = 'http://127.0.0.1:8000/api/v1';
const OUT = path.resolve('public', 'assets');

const JOBS = [
  { name: 'player_jet', prompt: 'modern grey camouflaged single-engine fighter jet, sleek delta wings, twin tail fins, military markings, game-ready low-poly, white background, side profile' },
  { name: 'enemy_jet',  prompt: 'red and black enemy fighter jet, swept wings, aggressive silhouette, game-ready low-poly, white background, side profile' },
  { name: 'cockpit',    prompt: 'modern fighter jet cockpit interior, F-35 style glass cockpit, two large multifunction displays, central HUD frame, side throttle, side control stick, ejection seat behind, dark grey panels with green and amber instrument lighting, photorealistic, game-ready, isolated on white background, view from inside looking forward' },
];

async function postJSON(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

async function getJSON(url, { retries = 6 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      return r.json();
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 2000 + i * 1000));
    }
  }
  throw lastErr;
}

async function downloadGLB(url, dst) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(dst, buf);
}

async function waitForJob(jobId) {
  let last = '', lastProgress = -1;
  while (true) {
    const s = await getJSON(`${FORGE}/generate/${jobId}`);
    const p = s.progress ?? 0;
    if (s.status !== last || Math.abs(p - lastProgress) >= 0.1) {
      console.log(`  [${jobId}] ${s.status} ${(p * 100).toFixed(0)}% ${s.message || ''}`);
      last = s.status; lastProgress = p;
    }
    if (s.status === 'completed' || s.status === 'failed') return s;
    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function adoptOrStart(job) {
  // If a job id was passed via env (e.g. PLAYER_JET_JOB_ID), adopt that instead of starting a new one.
  const envKey = `${job.name.toUpperCase()}_JOB_ID`;
  if (process.env[envKey]) {
    console.log(`  adopting existing job ${process.env[envKey]}`);
    return process.env[envKey];
  }
  const start = await postJSON(`${FORGE}/generate`, { prompt: job.prompt, grid_size: 2, animate: false });
  return start.job_id || start.id || start.jobId;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  for (const job of JOBS) {
    const dst = path.join(OUT, `${job.name}.glb`);
    try { await fs.access(dst); console.log(`✓ ${job.name} already exists, skipping`); continue; } catch {}

    console.log(`→ ${job.name}: "${job.prompt.slice(0, 60)}..."`);
    const id = await adoptOrStart(job);
    if (!id) { console.error('  no job id'); continue; }
    const final = await waitForJob(id);
    if (final.status !== 'completed') { console.error('  failed', final); continue; }
    const assetId = final.asset_id || final.assetId || (final.result && final.result.asset_id) || id;
    await downloadGLB(`${FORGE}/assets/${assetId}/file`, dst);
    console.log(`  saved ${dst}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
