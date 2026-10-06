import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

// JSONB 로 받은 숫자(bigint)는 그대로 쓰도록 기본 파서 유지
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL 환경변수가 없습니다. (Railway: Postgres 서비스의 DATABASE_URL 을 앱에 연결)')
  process.exit(1)
}
export const pool = new pg.Pool({
  connectionString: url,
  max: Number(process.env.PG_POOL_MAX || 10),
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
})
pool.on('error', (e) => console.error('pg pool error', e.message))

export const q = (text, params) => pool.query(text, params)

export async function migrate() {
  const sql = fs.readFileSync(path.join(here, '..', 'db', 'schema.sql'), 'utf8')
  await pool.query(sql)
}
