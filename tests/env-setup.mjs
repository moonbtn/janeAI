// Tests must never write to the production Neon branch. getDb() (used by
// every src/lib/db/* module) always reads DATABASE_URL, so for test runs we
// point that at the same branch TEST_DATABASE_URL already uses (the Neon
// "dev" branch) before any test file or module code runs.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be set (check .env.local) before running tests')
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
