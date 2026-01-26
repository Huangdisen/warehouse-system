'use client'
import DashboardLayout from '@/components/DashboardLayout'
import ThirdPartyInspectionReports from '@/components/ThirdPartyInspectionReports'

export default function ProductThirdPartyReportsPage() {
  return (
    <DashboardLayout>
      <ThirdPartyInspectionReports
        reportType="product"
        title="产品第三方检验报告"
        description="记录第三方机构出具的产品检验报告，支持上传与检索"
      />
    </DashboardLayout>
  )
}
