'use client'
import DashboardLayout from '@/components/DashboardLayout'
import ThirdPartyInspectionReports from '@/components/ThirdPartyInspectionReports'

export default function LabelThirdPartyReportsPage() {
  return (
    <DashboardLayout>
      <ThirdPartyInspectionReports
        reportType="label"
        title="标签第三方检验报告"
        description="记录第三方机构出具的标签检验报告，支持上传与检索"
      />
    </DashboardLayout>
  )
}
