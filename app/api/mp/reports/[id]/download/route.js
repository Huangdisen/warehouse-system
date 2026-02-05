import { apiError } from '@/lib/server/api-response'
import { requireMpAuth } from '@/lib/server/mp-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

function isHiddenRemark(remark = '') {
  return remark.startsWith('盘点调整') || remark.startsWith('贴半成品')
}

function toPdfHexUtf16Be(text = '') {
  const source = String(text)
  const le = Buffer.from(source, 'utf16le')
  const be = Buffer.alloc(le.length + 2)
  be[0] = 0xfe
  be[1] = 0xff
  for (let i = 0; i < le.length; i += 2) {
    be[i + 2] = le[i + 1]
    be[i + 3] = le[i]
  }
  return be.toString('hex').toUpperCase()
}

function buildPdfBuffer(lines) {
  const streamLines = ['BT', '/F1 12 Tf', '50 800 Td', '16 TL']
  for (const line of lines) {
    streamLines.push(`<${toPdfHexUtf16Be(line)}> Tj`)
    streamLines.push('T*')
  }
  streamLines.push('ET')
  const stream = streamLines.join('\n')
  const streamLength = Buffer.byteLength(stream, 'utf8')

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [6 0 R] >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor 7 0 R /DW 1000 >>\nendobj\n',
    '7 0 obj\n<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /ItalicAngle 0 /Ascent 752 /Descent -271 /CapHeight 737 /StemV 58 /MissingWidth 1000 >>\nendobj\n',
  ]

  const parts = ['%PDF-1.4\n']
  const offsets = [0]
  let currentOffset = Buffer.byteLength(parts[0], 'utf8')

  for (const obj of objects) {
    offsets.push(currentOffset)
    parts.push(obj)
    currentOffset += Buffer.byteLength(obj, 'utf8')
  }

  const xrefOffset = currentOffset
  parts.push(`xref\n0 ${objects.length + 1}\n`)
  parts.push('0000000000 65535 f \n')
  for (let i = 1; i <= objects.length; i += 1) {
    parts.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  }
  parts.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)

  return Buffer.from(parts.join(''), 'utf8')
}

export async function GET(request, { params }) {
  const auth = requireMpAuth(request, { roles: ['admin', 'staff', 'viewer'] })
  if (!auth.ok) return auth.response

  try {
    const id = params?.id
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('stock_records')
      .select(
        `
        id,
        stock_date,
        production_date,
        quantity,
        remark,
        products (name, spec),
        customers (name),
        profiles (name)
      `
      )
      .eq('id', id)
      .eq('type', 'out')
      .maybeSingle()

    if (error) return apiError('生成报告文档失败', 500, error.message)
    if (!data || isHiddenRemark(data.remark || '')) return apiError('报告不存在', 404)

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const lines = [
      '出厂检验报告',
      `报告编号：${String(data.id || '-')}`,
      `产品名称：${String(data.products?.name || '-')}`,
      `规格：${String(data.products?.spec || '-')}`,
      `客户：${String(data.customers?.name || '-')}`,
      `出库日期：${String(data.stock_date || '-')}`,
      `生产日期：${String(data.production_date || '-')}`,
      `数量：${String(data.quantity ?? '-')}`,
      `操作人：${String(data.profiles?.name || '-')}`,
      `备注：${String(data.remark || '-')}`,
      `生成时间：${String(now)}`,
    ]
    const pdfBuffer = buildPdfBuffer(lines)
    const fileName = `inspection-report-${id}.pdf`

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return apiError('生成报告PDF失败', 500, error.message)
  }
}
