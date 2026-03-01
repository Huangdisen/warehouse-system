import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

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

function toNum(val) {
  if (val === null || val === undefined || val === '') return null
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

function toInt(val) {
  if (val === null || val === undefined || val === '') return 0
  const n = parseInt(val)
  return isNaN(n) ? 0 : n
}

function cleanStr(val) {
  const s = val !== null && val !== undefined ? String(val).trim() : ''
  if (!s || s === '/' || s === ' ') return null
  return s
}

function padDate(val) {
  if (!val) return ''
  return String(val).trim().padStart(2, '0')
}

const ADMIN_ID = '601f62c1-b366-47b2-8582-378ec5a4e942'
const BATCH_SIZE = 500
// xlsx 文件路径（OneDrive 同步到外置盘）
const XLSX_PATH = '/Volumes/Sammmair/副本三乐简易库存表1.xlsx'

async function main() {
  const env = loadEnv()
  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'] || env['SUPABASE_URL']
  const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY']

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // 读取 xlsx
  console.log('读取文件:', XLSX_PATH)
  const wb = XLSX.readFile(XLSX_PATH)
  const ws = wb.Sheets['进出明细']
  if (!ws) {
    console.error('找不到"进出明细"工作表，工作表列表:', wb.SheetNames)
    process.exit(1)
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
  console.log(`xlsx 共 ${rows.length} 行（含表头）`)

  // 第一行是表头，跳过
  const dataRows = rows.slice(1)

  // 列索引：序号(0),省份(1),地区(2),年份(3),月份(4),日期(5),编码(6),名称(7),规格(8),
  // 单位(9),单价(10),总价(11),上次剩余(12),进货(13),出货(14),本次存货(15),
  // 客户(16),备注(17),辅助日期(18),联系方式(19),辅助列(20),最后一次(21)

  const records = []
  let skipped = 0

  for (const cols of dataRows) {
    const seqNo = toInt(cols[0])
    if (!seqNo) { skipped++; continue }

    const inbound = toInt(cols[13])
    const outbound = toInt(cols[14])

    // 过滤掉进出均为0的汇总行
    if (inbound === 0 && outbound === 0) { skipped++; continue }

    const year = cols[3] ? String(cols[3]).trim() : ''
    const month = padDate(cols[4])
    const day = padDate(cols[5])

    if (!year || !month || !day || month === '00' || day === '00') { skipped++; continue }

    const saleDate = `${year}-${month}-${day}`

    const productName = cols[7] ? String(cols[7]).trim() : ''
    if (!productName || productName === ' ') { skipped++; continue }

    const totalPriceRaw = toNum(cols[11])

    records.push({
      seq_no: seqNo,
      province: cleanStr(cols[1]),
      area: cleanStr(cols[2]),
      sale_date: saleDate,
      product_code: cleanStr(cols[6]),
      product_name: productName,
      product_spec: cleanStr(cols[8]),
      unit: cleanStr(cols[9]) || '件',
      unit_price: toNum(cols[10]),
      total_price: totalPriceRaw === 0 ? null : totalPriceRaw,
      inbound,
      outbound,
      customer: cleanStr(cols[16]),
      remark: cleanStr(cols[17]),
      contact: cleanStr(cols[19]),
      created_by: ADMIN_ID,
    })
  }

  console.log(`总数据行: ${dataRows.length}，跳过: ${skipped}，待 upsert: ${records.length}`)

  let upserted = 0
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('sales_records')
      .upsert(batch, { onConflict: 'seq_no' })
    if (error) {
      console.error(`批次 ${Math.floor(i / BATCH_SIZE) + 1} 失败:`, error.message)
      process.exit(1)
    }
    upserted += batch.length
    process.stdout.write(`\r已处理: ${upserted} / ${records.length}`)
  }

  console.log(`\n导入完成！共 upsert ${upserted} 条记录。`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
