import { apiError, apiOk } from '@/lib/server/api-response'
import { requireMpAuth } from '@/lib/server/mp-auth'
import { createReportViewLinkToken } from '@/lib/server/report-view-link'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

const BUCKET_NAME = 'third-party-reports'
const URL_EXPIRES_SECONDS = 5 * 60
const DEFAULT_WEB_BASE_URL = 'https://kucun.bearaiapp.com'

export async function GET(request, { params }) {
  const auth = requireMpAuth(request, { roles: ['admin', 'staff', 'viewer'] })
  if (!auth.ok) return auth.response

  try {
    const id = params?.id
    const supabase = getSupabaseAdmin()

    const { data: report, error } = await supabase
      .from('third_party_inspection_reports')
      .select('id, report_name, file_name, file_path, report_date')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      return apiError('查询报告附件失败', 500, error.message)
    }

    if (!report) {
      const { data: outboundRecord, error: outboundError } = await supabase
        .from('stock_records')
        .select('id')
        .eq('id', id)
        .eq('type', 'out')
        .maybeSingle()

      if (outboundError) {
        return apiError('查询报告附件失败', 500, outboundError.message)
      }

      if (!outboundRecord) {
        return apiError('报告不存在或未上传附件', 404)
      }

      const { exp, sig } = createReportViewLinkToken(id)
      const baseUrl =
        process.env.MP_WEB_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        DEFAULT_WEB_BASE_URL
      const webUrl = `${baseUrl}/mp/report-view/${encodeURIComponent(id)}?exp=${exp}&sig=${encodeURIComponent(sig)}`

      return apiOk({
        id,
        type: 'web',
        web_url: webUrl,
      })
    }

    const { data: urlData, error: urlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(report.file_path, URL_EXPIRES_SECONDS)

    if (urlError || !urlData?.signedUrl) {
      return apiError('生成附件访问地址失败', 500, urlError?.message)
    }

    return apiOk({
      id: report.id,
      type: 'file',
      report_name: report.report_name,
      file_name: report.file_name,
      report_date: report.report_date,
      file_url: urlData.signedUrl,
      expires_in: URL_EXPIRES_SECONDS,
    })
  } catch (error) {
    return apiError('查询报告附件失败', 500, error.message)
  }
}
