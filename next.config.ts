import type { NextConfig } from "next";
import fs from 'fs';
import path from 'path';

// .env.local should override empty system env vars (e.g. ANTHROPIC_API_KEY set by Claude CLI)
try {
  const envPath = path.join(process.cwd(), '.env.local');
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key] && val) {
      process.env[key] = val;
    }
  }
} catch {
  // .env.local not present (e.g. in production)
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
