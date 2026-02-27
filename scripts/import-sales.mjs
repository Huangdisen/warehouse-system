import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 读取 .env.local
function loadEnv() {
  const envPath = join(__dirname, '..', '.env.local')
  const raw = readFileSync(envPath, 'utf-8')
  const env = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim()
    env[key] = val
  }
  return env
}

// 解析 CSV（支持引号内含逗号）
function parseCSV(text) {
  const lines = text.split('\n')
  const rows = []
  for (const line of lines) {
    if (!line.trim()) continue
    const cols = []
    let inQuote = false
    let cur = ''
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuote = !inQuote
        }
      } else if (ch === ',' && !inQuote) {
        cols.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
    cols.push(cur)
    rows.push(cols)
  }
  return rows
}

function toNum(val) {
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

function toInt(val) {
  const v = val ? val.trim() : ''
  if (!v) return 0
  const n = parseInt(v)
  return isNaN(n) ? 0 : n
}

function cleanStr(val) {
  const s = val ? val.trim() : ''
  if (!s || s === '/' || s === ' ') return null
  return s
}

const ADMIN_ID = '601f62c1-b366-47b2-8582-378ec5a4e942'
const BATCH_SIZE = 500

async function main() {
  const env = loadEnv()
  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'] || env['SUPABASE_URL']
  const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY']

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // 读取 CSV（BOM 兼容）
  const csvPath = join(__dirname, '..', '进出明细.csv')
  let raw = readFileSync(csvPath, 'utf-8')
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1) // strip BOM

  const rows = parseCSV(raw)
  if (rows.length < 2) {
    console.error('CSV is empty or has no data rows')
    process.exit(1)
  }

  // 列索引（基于 header）
  // 序号(0),省份(1),地区(2),年份(3),月份(4),日期(5),编码(6),名称(7),规格(8),
  // 单位(9),单价(10),总价(11),上次剩余(12),进货(13),出货(14),本次存货(15),
  // 客户(16),备注(17),辅助日期(18),联系方式(19),辅助列(20),最后一次(21)
  const dataRows = rows.slice(1) // skip header

  const records = []
  let skipped = 0

  for (const cols of dataRows) {
    if (cols.length < 15) continue

    const inbound = toInt(cols[13])
    const outbound = toInt(cols[14])

    // 过滤掉进出均为0的汇总行
    if (inbound === 0 && outbound === 0) {
      skipped++
      continue
    }

    const year = cols[3] ? cols[3].trim() : ''
    const month = cols[4] ? cols[4].trim().padStart(2, '0') : ''
    const day = cols[5] ? cols[5].trim().padStart(2, '0') : ''

    if (!year || !month || !day) {
      skipped++
      continue
    }

    const saleDate = `${year}-${month}-${day}`

    const productName = cols[7] ? cols[7].trim() : ''
    if (!productName) {
      skipped++
      continue
    }

    const unitPriceRaw = toNum(cols[10])
    const totalPriceRaw = toNum(cols[11])

    records.push({
      province: cleanStr(cols[1]),
      area: cleanStr(cols[2]),
      sale_date: saleDate,
      product_code: cleanStr(cols[6]),
      product_name: productName,
      product_spec: cleanStr(cols[8]),
      unit: cleanStr(cols[9]) || '件',
      unit_price: unitPriceRaw,
      total_price: totalPriceRaw === 0 ? null : totalPriceRaw,
      inbound,
      outbound,
      customer: cleanStr(cols[16]),
      remark: cleanStr(cols[17]),
      contact: cleanStr(cols[19]),
      created_by: ADMIN_ID,
    })
  }

  console.log(`总数据行: ${dataRows.length}，跳过: ${skipped}，待导入: ${records.length}`)

  let inserted = 0
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('sales_records').insert(batch)
    if (error) {
      console.error(`批次 ${Math.floor(i / BATCH_SIZE) + 1} 插入失败:`, error.message)
      process.exit(1)
    }
    inserted += batch.length
    process.stdout.write(`\r已插入: ${inserted} / ${records.length}`)
  }

  console.log(`\n导入完成！共插入 ${inserted} 条记录。`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
