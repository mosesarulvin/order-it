/**
 * OrderIt crash fuzzer — targets key API surfaces with boundary and malformed inputs.
 * Run: node fuzzer.js
 * Requires: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// TLS verification is always enforced. If your local Supabase instance uses
// a self-signed cert, add the CA to the system trust store rather than
// disabling verification globally.

// Parse .env without dotenv dependency
const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
Object.assign(process.env, env)

// Node 20 lacks native WebSocket; polyfill with a no-op to disable realtime
// (fuzzer only uses REST/RPC — no subscriptions needed)
if (!globalThis.WebSocket) {
  globalThis.WebSocket = class {
    constructor() { setTimeout(() => this.onerror?.({ message: 'disabled' }), 0) }
    close() {}
    send() {}
  }
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

let passed = 0
let failed = 0
const issues = []

function log(label, status, detail = '') {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '!'
  console.log(`  [${icon}] ${label}${detail ? ' — ' + detail : ''}`)
  if (status === 'PASS') passed++
  else if (status === 'FAIL') { failed++; issues.push(`${label}: ${detail}`) }
}

async function section(title, fn) {
  console.log(`\n── ${title}`)
  await fn()
}

// ─── Fuzz payloads ───────────────────────────────────────────────────────────

const EMPTY              = ''
const WHITESPACE         = '   \t\n'
const LONG_STRING        = 'A'.repeat(10_000)
const SQL_INJECT         = "' OR '1'='1'; DROP TABLE orders; --"
const NULL_BYTE          = 'abc\0def'
const UNICODE_BOMB       = '🔥'.repeat(500)
const NEGATIVE_NUM       = -999
const ZERO               = 0
const HUGE_NUM           = Number.MAX_SAFE_INTEGER
const FLOAT_PRICE        = 99.999999999
const BOGUS_UUID         = '00000000-0000-0000-0000-000000000000'
const MALFORMED_UUID     = 'not-a-uuid'
const EXPIRED_DATE       = '1900-01-01T00:00:00Z'
const FUTURE_DATE        = '2099-12-31T23:59:59Z'

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Fetch a real shop slug and id for tests that need a valid context
async function getRealShop() {
  const { data } = await supabase.from('shops').select('id, slug').limit(1).single()
  return data ?? null
}

// Ensure a response doesn't cause a JS crash (throw) — the RPC/query itself may return an error
function expectNoThrow(label, fn) {
  return fn().then(({ data, error }) => {
    // An error from Supabase is acceptable (expected for bad input); a JS throw is not
    log(label, 'PASS', error ? `rejected: ${error.message.slice(0, 80)}` : `data: ${JSON.stringify(data).slice(0, 80)}`)
  }).catch((err) => {
    log(label, 'FAIL', `threw: ${err.message}`)
  })
}

// ─── Test suites ─────────────────────────────────────────────────────────────

await section('verify_customer_password RPC — injection & boundary inputs', async () => {
  const shop = await getRealShop()
  if (!shop) { console.log('  (skipped — no shop found)'); return }

  const cases = [
    ['SQL injection in phone',    { p_shop_id: shop.id, p_phone: SQL_INJECT,   p_password: 'test' }],
    ['SQL injection in password', { p_shop_id: shop.id, p_phone: '9999999999', p_password: SQL_INJECT }],
    ['Empty phone',               { p_shop_id: shop.id, p_phone: EMPTY,        p_password: 'test' }],
    ['Empty password',            { p_shop_id: shop.id, p_phone: '9999999999', p_password: EMPTY }],
    ['Whitespace phone',          { p_shop_id: shop.id, p_phone: WHITESPACE,   p_password: 'test' }],
    ['Null byte in password',     { p_shop_id: shop.id, p_phone: '9999999999', p_password: NULL_BYTE }],
    ['10 000-char password',      { p_shop_id: shop.id, p_phone: '9999999999', p_password: LONG_STRING }],
    ['Unicode bomb password',     { p_shop_id: shop.id, p_phone: '9999999999', p_password: UNICODE_BOMB }],
    ['Bogus shop UUID',           { p_shop_id: BOGUS_UUID, p_phone: '9999999999', p_password: 'test' }],
    ['Malformed shop UUID',       { p_shop_id: MALFORMED_UUID, p_phone: '9999999999', p_password: 'test' }],
    ['Null shop id',              { p_shop_id: null, p_phone: '9999999999', p_password: 'test' }],
  ]

  for (const [label, args] of cases) {
    await expectNoThrow(label, () => supabase.rpc('verify_customer_password', args))
  }
})

await section('hash_customer_password RPC — boundary inputs', async () => {
  const cases = [
    ['Empty string',       { p_password: EMPTY }],
    ['Whitespace only',    { p_password: WHITESPACE }],
    ['10 000-char string', { p_password: LONG_STRING }],
    ['Unicode bomb',       { p_password: UNICODE_BOMB }],
    ['SQL injection',      { p_password: SQL_INJECT }],
    ['Null byte',          { p_password: NULL_BYTE }],
  ]

  for (const [label, args] of cases) {
    await expectNoThrow(label, () => supabase.rpc('hash_customer_password', args))
  }
})

await section('orders table — malformed reads (RLS / type safety)', async () => {
  const cases = [
    ['Filter by bogus UUID shop_id',      () => supabase.from('orders').select('id').eq('shop_id', BOGUS_UUID).limit(1)],
    ['Filter by malformed UUID',          () => supabase.from('orders').select('id').eq('shop_id', MALFORMED_UUID).limit(1)],
    ['Filter by SQL inject in status',    () => supabase.from('orders').select('id').eq('status', SQL_INJECT).limit(1)],
    ['Select with huge limit',            () => supabase.from('orders').select('id').limit(100_000)],
    ['Filter by far-future created_at',   () => supabase.from('orders').select('id').gt('created_at', FUTURE_DATE).limit(1)],
    ['Filter by ancient created_at',      () => supabase.from('orders').select('id').lt('created_at', EXPIRED_DATE).limit(1)],
  ]

  for (const [label, fn] of cases) {
    await expectNoThrow(label, fn)
  }
})

await section('menu_items table — boundary reads', async () => {
  const shop = await getRealShop()
  if (!shop) { console.log('  (skipped — no shop found)'); return }

  const cases = [
    ['Empty name filter',          () => supabase.from('menu_items').select('id').eq('name', EMPTY).eq('shop_id', shop.id).limit(1)],
    ['SQL inject name filter',     () => supabase.from('menu_items').select('id').eq('name', SQL_INJECT).eq('shop_id', shop.id).limit(1)],
    ['Negative price filter',      () => supabase.from('menu_items').select('id').lt('price', NEGATIVE_NUM).eq('shop_id', shop.id).limit(1)],
    ['Huge price filter',          () => supabase.from('menu_items').select('id').gt('price', HUGE_NUM).eq('shop_id', shop.id).limit(1)],
  ]

  for (const [label, fn] of cases) {
    await expectNoThrow(label, fn)
  }
})

await section('coupons table — boundary reads', async () => {
  const shop = await getRealShop()
  if (!shop) { console.log('  (skipped — no shop found)'); return }

  const cases = [
    ['SQL inject coupon code',     () => supabase.from('coupons').select('*').eq('code', SQL_INJECT).eq('shop_id', shop.id).maybeSingle()],
    ['Empty coupon code',          () => supabase.from('coupons').select('*').eq('code', EMPTY).eq('shop_id', shop.id).maybeSingle()],
    ['10 000-char coupon code',    () => supabase.from('coupons').select('*').eq('code', LONG_STRING).eq('shop_id', shop.id).maybeSingle()],
    ['Unicode bomb coupon code',   () => supabase.from('coupons').select('*').eq('code', UNICODE_BOMB).eq('shop_id', shop.id).maybeSingle()],
    ['Bogus shop UUID',            () => supabase.from('coupons').select('*').eq('shop_id', BOGUS_UUID).limit(1)],
  ]

  for (const [label, fn] of cases) {
    await expectNoThrow(label, fn)
  }
})

await section('customer_profiles table — direct write abuse (should be rejected by RLS)', async () => {
  const shop = await getRealShop()
  if (!shop) { console.log('  (skipped — no shop found)'); return }

  // These should be REJECTED by the tightened policy + bcrypt constraint
  const shouldReject = [
    ['Empty phone',          { shop_id: shop.id, name: 'X',          phone: EMPTY,        password: '$2a$06$validbcrypthashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', email: 'x@x.com', birthday: '2000-01-01' }],
    ['Plaintext password',   { shop_id: shop.id, name: 'X',          phone: '9000000099', password: 'plaintext',  email: 'x@x.com', birthday: '2000-01-01' }],
    ['10 000-char name',     { shop_id: shop.id, name: LONG_STRING,  phone: '9000000088', password: '$2a$06$validbcrypthashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', email: 'x@x.com', birthday: '2000-01-01' }],
    ['Empty name',           { shop_id: shop.id, name: EMPTY,        phone: '9000000077', password: '$2a$06$validbcrypthashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', email: 'x@x.com', birthday: '2000-01-01' }],
    ['Bogus shop_id',        { shop_id: BOGUS_UUID, name: 'X',       phone: '9000000066', password: '$2a$06$validbcrypthashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', email: 'x@x.com', birthday: '2000-01-01' }],
  ]

  for (const [label, row] of shouldReject) {
    const { data, error } = await supabase.from('customer_profiles').insert(row).select('id').catch((e) => ({ data: null, error: e }))
    if (error) {
      log(`REJECT ${label}`, 'PASS', `rejected: ${String(error.message ?? error).slice(0, 80)}`)
    } else {
      log(`REJECT ${label}`, 'FAIL', `was accepted — id: ${data?.[0]?.id}`)
    }
  }
})

await section('orders table — direct write abuse (should be rejected by RLS)', async () => {
  const shop = await getRealShop()
  if (!shop) { console.log('  (skipped — no shop found)'); return }

  const baseOrder = {
    shop_id: shop.id,
    order_number: 'FUZZ-001',
    customer_name: 'Fuzzer',
    customer_phone: '9999999999',
    status: 'pending',
    payment_method: 'cash',
    payment_status: 'pending',
    order_type: 'dine_in',
    order_source: 'qr',
    subtotal: 100,
    tax_amount: 0,
    packing_charge: 0,
    total: 100,
  }

  // These should now be REJECTED by the tightened WITH CHECK policy
  const shouldReject = [
    ['Negative total',          { ...baseOrder, total: NEGATIVE_NUM }],
    ['Negative discount',       { ...baseOrder, discount_amount: NEGATIVE_NUM }],
    ['Negative subtotal',       { ...baseOrder, subtotal: NEGATIVE_NUM }],
    ['Negative tax_amount',     { ...baseOrder, tax_amount: NEGATIVE_NUM }],
    ['Notes > 500 chars',       { ...baseOrder, notes: 'A'.repeat(501) }],
    ['Invalid status',          { ...baseOrder, status: SQL_INJECT }],
    ['Invalid payment method',  { ...baseOrder, payment_method: SQL_INJECT }],
    ['Bogus shop_id',           { ...baseOrder, shop_id: BOGUS_UUID }],
    ['Huge total (overflow)',   { ...baseOrder, total: HUGE_NUM }],
  ]

  for (const [label, row] of shouldReject) {
    const { data, error } = await supabase.from('orders').insert(row).select('id').catch((e) => ({ data: null, error: e }))
    if (error) {
      log(`REJECT ${label}`, 'PASS', `rejected: ${String(error.message ?? error).slice(0, 80)}`)
    } else {
      log(`REJECT ${label}`, 'FAIL', `was accepted — id: ${data?.[0]?.id}`)
    }
  }

  // Zero total should still be allowed (free orders)
  await expectNoThrow('ALLOW zero total', () => supabase.from('orders').insert({ ...baseOrder, total: ZERO }).select('id'))
})

await section('shop_invites table — enumeration / privilege escalation', async () => {
  // Direct table read should now return nothing (policy removed)
  const { data: all } = await supabase.from('shop_invites').select('id, role, shop_id').limit(5)
  if (!all || all.length === 0) {
    log('Anon cannot enumerate invites (direct table)', 'PASS', 'no rows returned')
  } else {
    log('Anon cannot enumerate invites (direct table)', 'FAIL', `returned ${all.length} rows: ${JSON.stringify(all[0])}`)
  }

  // get_invite_preview RPC should still work for a known ID
  await expectNoThrow('get_invite_preview with bogus id', () => supabase.rpc('get_invite_preview', { p_invite_id: BOGUS_UUID }))
  await expectNoThrow('get_invite_preview with SQL inject id', () => supabase.rpc('get_invite_preview', { p_invite_id: SQL_INJECT }))
})

await section('accept_invite RPC — privilege escalation attempts', async () => {
  const cases = [
    ['Bogus invite id',      { p_invite_id: BOGUS_UUID }],
    ['Malformed invite id',  { p_invite_id: MALFORMED_UUID }],
    ['SQL inject invite id', { p_invite_id: SQL_INJECT }],
    ['Empty invite id',      { p_invite_id: EMPTY }],
    ['Null invite id',       { p_invite_id: null }],
  ]

  for (const [label, args] of cases) {
    await expectNoThrow(label, () => supabase.rpc('accept_invite', args))
  }
})

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)

if (issues.length > 0) {
  console.log('\nFailed cases (JS throw = crash risk):')
  issues.forEach((i) => console.log(`  • ${i}`))
} else {
  console.log('\nNo JS-level crashes detected.')
}
