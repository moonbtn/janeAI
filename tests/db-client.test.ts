import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

test('createDb can run a trivial query against TEST_DATABASE_URL', async () => {
  const url = process.env.TEST_DATABASE_URL
  assert.ok(url, 'TEST_DATABASE_URL must be set to run db tests')
  const db = createDb(url!)
  const result = await db.execute(sql`select 1 as one`)
  assert.equal(Number(result.rows[0].one), 1)
})

test('createDb supports a transaction that commits both statements', async () => {
  const db = createDb(process.env.TEST_DATABASE_URL!)
  const tableName = `tx_smoke_test_${Date.now()}`
  await db.execute(sql.raw(`create table ${tableName} (id int)`))
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`insert into ${tableName} (id) values (1)`))
      await tx.execute(sql.raw(`insert into ${tableName} (id) values (2)`))
    })
    const result = await db.execute(sql.raw(`select count(*) as c from ${tableName}`))
    assert.equal(Number(result.rows[0].c), 2)
  } finally {
    await db.execute(sql.raw(`drop table ${tableName}`))
  }
})
