'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const RESULT_OPTIONS = [
  { value: 'qualified', label: '合格' },
  { value: 'unqualified', label: '不合格' },
]

const emptyForm = () => ({
  production_date_batch: '',
  shelf_life: '',
  supplier_contact: '',
  supplier_address: '',
  manufacturer: '',
  manufacturer_license: '',
  invoice_no: '',
  inspection_report_no: '',
  acceptance_result: 'qualified',
  inspector_name: '王',
  remark: '',
})

export default function RawMaterialAcceptancePage() {
  const [records, setRecords] = useState([])
  const [acceptances, setAcceptances] = useState({})
  const [loading, setLoading] = useState(true)
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterResult, setFilterResult] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [suppliers, setSuppliers] = useState([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeRecord, setActiveRecord] = useState(null)
  const [formData, setFormData] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchRecords()
  }, [filterDateFrom, filterDateTo, filterSupplier])

  const fetchRecords = async () => {
    setLoading(true)
    let query = supabase
      .from('purchase_records')
      .select('id, item_name, spec, quantity, unit, supplier, purchase_date, remark')
      .eq('category', 'raw_material')
      .order('purchase_date', { ascending: false })
      .limit(300)

    if (filterDateFrom) query = query.gte('purchase_date', filterDateFrom)
    if (filterDateTo) query = query.lte('purchase_date', filterDateTo)
    if (filterSupplier) query = query.eq('supplier', filterSupplier)

    const { data: pr } = await query
    const recs = pr || []
    setRecords(recs)

    const { data: allSuppliers } = await supabase
      .from('purchase_records')
      .select('supplier')
      .eq('category', 'raw_material')
      .not('supplier', 'is', null)
    setSuppliers([...new Set((allSuppliers || []).map(r => r.supplier).filter(Boolean))].sort())

    if (recs.length > 0) {
      const ids = recs.map(r => r.id)
      const { data: accData } = await supabase
        .from('raw_material_acceptances')
        .select('*')
        .in('purchase_record_id', ids)
      const grouped = {}
      ;(accData || []).forEach(a => { grouped[a.purchase_record_id] = a })
      setAcceptances(grouped)
    } else {
      setAcceptances({})
    }
    setLoading(false)
  }

  const openDrawer = (record) => {
    const existing = acceptances[record.id]
    setActiveRecord(record)
    setFormData(existing ? {
      production_date_batch: existing.production_date_batch || '',
      shelf_life: existing.shelf_life || '',
      supplier_contact: existing.supplier_contact || '',
      supplier_address: existing.supplier_address || '',
      manufacturer: existing.manufacturer || '',
      manufacturer_license: existing.manufacturer_license || '',
      invoice_no: existing.invoice_no || '',
      inspection_report_no: existing.inspection_report_no || '',
      acceptance_result: existing.acceptance_result || 'qualified',
      inspector_name: existing.inspector_name || '',
      remark: existing.remark || '',
    } : emptyForm())
    setDrawerOpen(true)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setActiveRecord(null)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!activeRecord) return
    setSaving(true)

    const { data: { session } } = await supabase.auth.getSession()
    const existing = acceptances[activeRecord.id]
    const payload = {
      ...formData,
      purchase_record_id: activeRecord.id,
      updated_at: new Date().toISOString(),
    }

    let error
    if (existing) {
      ;({ error } = await supabase
        .from('raw_material_acceptances')
        .update(payload)
        .eq('id', existing.id))
    } else {
      ;({ error } = await supabase
        .from('raw_material_acceptances')
        .insert({ ...payload, created_by: session?.user?.id }))
    }

    if (error) {
      alert('保存失败：' + error.message)
    } else {
      await fetchRecords()
      closeDrawer()
    }
    setSaving(false)
  }

  const filteredRecords = useMemo(() => {
    let result = records
    if (filterResult !== 'all') {
      result = result.filter(r => {
        const acc = acceptances[r.id]
        if (filterResult === 'none') return !acc
        return acc?.acceptance_result === filterResult
      })
    }
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase()
      result = result.filter(r => {
        const acc = acceptances[r.id]
        return [r.item_name, r.spec, r.supplier, acc?.manufacturer, acc?.inspector_name]
          .some(f => (f || '').toLowerCase().includes(term))
      })
    }
    return result
  }, [records, acceptances, filterResult, searchTerm])

  const handlePrint = () => {
    window.print()
  }

  const year = filterDateFrom ? filterDateFrom.slice(0, 4) : new Date().getFullYear()

  return (
    <DashboardLayout>
      <style>{`
        @media print {
          * { visibility: hidden !important; }
          #print-root, #print-root * { visibility: visible !important; }
          #print-root { position: absolute; top: 0; left: 0; width: 100%; background: white; }
        }
        @media screen {
          #print-root { display: none; }
        }
      `}</style>

      {/* 打印区域 */}
      <div id="print-root">
        <div style={{ fontFamily: 'SimSun, serif', fontSize: '11pt', padding: '10mm 15mm' }}>
          <h2 style={{ textAlign: 'center', fontSize: '14pt', fontWeight: 'bold', marginBottom: 4 }}>食品原料验收记录</h2>
          <p style={{ textAlign: 'center', marginBottom: 8 }}>（{year}）年</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
            <thead>
              <tr>
                {['进货日期','食品原料名称','生产日期/批号','保质期','规格','数量（单位）',
                  '供货者名称及联系方式','供货者地址','生产商名称','生产商许可证编号',
                  '进货票据编号','检验报告编号','验收结果','验收人员签字'].map(h => (
                  <th key={h} style={{ border: '1px solid #000', padding: '3px 4px', background: '#f5f5f5', textAlign: 'center', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map(r => {
                const acc = acceptances[r.id]
                return (
                  <tr key={r.id}>
                    <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>{r.purchase_date}</td>
                    <td style={{ border: '1px solid #000', padding: '3px 4px' }}>{r.item_name}</td>
                    <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>{acc?.production_date_batch || ''}</td>
                    <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>{acc?.shelf_life || ''}</td>
                    <td style={{ border: '1px solid #000', padding: '3px 4px' }}>{r.spec || ''}</td>
                    <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>{r.quantity}{r.unit ? `（${r.unit}）` : ''}</td>
                    <td style={{ border: '1px solid #000', padding: '3px 4px' }}>{[r.supplier, acc?.supplier_contact].filter(Boolean).join(' ')}</td>
                    <td style={{ border: '1px solid #000', padding: '3px 4px' }}>{acc?.supplier_address || ''}</td>
                    <td style={{ border: '1px solid #000', padding: '3px 4px' }}>{acc?.manufacturer || ''}</td>
                    <td style={{ border: '1px solid #000', padding: '3px 4px' }}>{acc?.manufacturer_license || ''}</td>
                    <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>{acc?.invoice_no || ''}</td>
                    <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>{acc?.inspection_report_no || ''}</td>
                    <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>{acc ? (acc.acceptance_result === 'qualified' ? '合格' : '不合格') : ''}</td>
                    <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>{acc?.inspector_name || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p style={{ marginTop: 8, fontSize: '9pt' }}>注："数量（）"中括号内填写数量单位，如：公斤等。</p>
        </div>
      </div>

      {/* 正常页面 */}
      <div className="no-print">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">食品原料验收记录</h1>
            <p className="text-slate-500">基于原材料采购记录，补充填写验收信息</p>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold shadow hover:bg-slate-700"
          >
            🖨️ 打印记录表
          </button>
        </div>

        {/* 筛选 */}
        <div className="surface-card p-4 mb-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-slate-600 text-sm mb-1">开始日期</label>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="input-field w-36" />
          </div>
          <div>
            <label className="block text-slate-600 text-sm mb-1">结束日期</label>
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="input-field w-36" />
          </div>
          <div>
            <label className="block text-slate-600 text-sm mb-1">供货者</label>
            <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} className="select-field w-40">
              <option value="">全部</option>
              {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-slate-600 text-sm mb-1">验收结果</label>
            <select value={filterResult} onChange={e => setFilterResult(e.target.value)} className="select-field w-32">
              <option value="all">全部</option>
              <option value="qualified">合格</option>
              <option value="unqualified">不合格</option>
              <option value="none">未填写</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-600 text-sm mb-1">关键词</label>
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="品名/规格/供货者/生产商" className="input-field w-52" />
          </div>
          {(filterDateFrom || filterDateTo || filterSupplier || filterResult !== 'all' || searchTerm) && (
            <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterSupplier(''); setFilterResult('all'); setSearchTerm('') }}
              className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">
              清除
            </button>
          )}
        </div>

        {/* 统计 */}
        <div className="surface-inset px-4 py-2 mb-4 text-sm text-slate-600 flex gap-6">
          <span>共 {filteredRecords.length} 条</span>
          <span>已填写 {filteredRecords.filter(r => acceptances[r.id]).length} 条</span>
          <span className="text-emerald-600">合格 {filteredRecords.filter(r => acceptances[r.id]?.acceptance_result === 'qualified').length}</span>
          <span className="text-red-500">不合格 {filteredRecords.filter(r => acceptances[r.id]?.acceptance_result === 'unqualified').length}</span>
        </div>

        {/* 表格 */}
        {loading ? (
          <div className="text-center py-16 text-slate-400">加载中...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-16 text-slate-400">暂无原材料采购记录</div>
        ) : (
          <div className="surface-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 px-4 text-slate-500 font-medium whitespace-nowrap">进货日期</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-medium whitespace-nowrap">原料名称</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-medium whitespace-nowrap">规格</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-medium whitespace-nowrap">数量</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-medium whitespace-nowrap">供货者</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-medium whitespace-nowrap">生产日期/批号</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-medium whitespace-nowrap">生产商</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-medium whitespace-nowrap">验收结果</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-medium whitespace-nowrap">验收人</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => {
                  const acc = acceptances[record.id]
                  return (
                    <tr key={record.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{record.purchase_date}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{record.item_name}</td>
                      <td className="py-3 px-4 text-slate-500">{record.spec || '-'}</td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{record.quantity}{record.unit ? ` ${record.unit}` : ''}</td>
                      <td className="py-3 px-4 text-slate-600">{record.supplier || '-'}</td>
                      <td className="py-3 px-4 text-slate-500">{acc?.production_date_batch || <span className="text-slate-300">-</span>}</td>
                      <td className="py-3 px-4 text-slate-500">{acc?.manufacturer || <span className="text-slate-300">-</span>}</td>
                      <td className="py-3 px-4">
                        {acc ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            acc.acceptance_result === 'qualified'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-red-50 text-red-600'
                          }`}>
                            {acc.acceptance_result === 'qualified' ? '合格' : '不合格'}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">未填写</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500">{acc?.inspector_name || <span className="text-slate-300">-</span>}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => openDrawer(record)}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {acc ? '编辑' : '填写'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 抽屉 */}
      {drawerOpen && activeRecord && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={closeDrawer} />
          <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-semibold text-slate-900">填写验收信息</h2>
                <p className="text-sm text-slate-500">{activeRecord.item_name} · {activeRecord.purchase_date}</p>
              </div>
              <button onClick={closeDrawer} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            {/* 采购信息（只读） */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
              <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">采购信息（自动填入）</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div><span className="text-slate-400">品名：</span><span className="text-slate-700">{activeRecord.item_name}</span></div>
                <div><span className="text-slate-400">规格：</span><span className="text-slate-700">{activeRecord.spec || '-'}</span></div>
                <div><span className="text-slate-400">数量：</span><span className="text-slate-700">{activeRecord.quantity} {activeRecord.unit}</span></div>
                <div><span className="text-slate-400">进货日期：</span><span className="text-slate-700">{activeRecord.purchase_date}</span></div>
                <div className="col-span-2"><span className="text-slate-400">供货者：</span><span className="text-slate-700">{activeRecord.supplier || '-'}</span></div>
              </div>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">生产日期/批号</label>
                  <input type="text" value={formData.production_date_batch} onChange={e => setFormData({...formData, production_date_batch: e.target.value})} className="input-field" placeholder="如 2025-01-01 / B2501" />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">保质期</label>
                  <input type="text" value={formData.shelf_life} onChange={e => setFormData({...formData, shelf_life: e.target.value})} className="input-field" placeholder="如 12个月" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">供货者联系方式</label>
                  <input type="text" value={formData.supplier_contact} onChange={e => setFormData({...formData, supplier_contact: e.target.value})} className="input-field" placeholder="电话/手机" />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">供货者地址</label>
                  <input type="text" value={formData.supplier_address} onChange={e => setFormData({...formData, supplier_address: e.target.value})} className="input-field" placeholder="地址" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">生产商名称</label>
                  <input type="text" value={formData.manufacturer} onChange={e => setFormData({...formData, manufacturer: e.target.value})} className="input-field" placeholder="生产商" />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">生产商许可证编号</label>
                  <input type="text" value={formData.manufacturer_license} onChange={e => setFormData({...formData, manufacturer_license: e.target.value})} className="input-field" placeholder="许可证号" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">进货票据编号</label>
                  <input type="text" value={formData.invoice_no} onChange={e => setFormData({...formData, invoice_no: e.target.value})} className="input-field" placeholder="发票/票据号" />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">批次检验报告编号</label>
                  <input type="text" value={formData.inspection_report_no} onChange={e => setFormData({...formData, inspection_report_no: e.target.value})} className="input-field" placeholder="检验报告编号" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">验收结果</label>
                  <select value={formData.acceptance_result} onChange={e => setFormData({...formData, acceptance_result: e.target.value})} className="select-field">
                    {RESULT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">验收人员签字</label>
                  <input type="text" value={formData.inspector_name} onChange={e => setFormData({...formData, inspector_name: e.target.value})} className="input-field" placeholder="验收人姓名" />
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-600 mb-1">备注</label>
                <textarea value={formData.remark} onChange={e => setFormData({...formData, remark: e.target.value})} className="input-field resize-none" rows={2} placeholder="可选" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50">
                  {saving ? '保存中...' : '保存'}
                </button>
                <button type="button" onClick={closeDrawer} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
