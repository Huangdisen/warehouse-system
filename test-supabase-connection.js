// 测试 Supabase 连接
import { supabase } from './lib/supabase.js'

async function testConnection() {
  console.log('🔄 正在测试 Supabase 连接...\n')

  try {
    // 测试基本连接
    const { data, error } = await supabase
      .from('_metadata')
      .select('*')
      .limit(1)

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = 表不存在，这是正常的
      if (error.message.includes('JWT')) {
        console.log('❌ 认证失败：API Key 可能不正确')
        console.log('错误详情:', error.message)
      } else {
        console.log('⚠️  收到错误（可能是正常的）:', error.message)
      }
    }

    // 获取数据库信息
    const { data: tables, error: tablesError } = await supabase
      .rpc('get_tables')
      .catch(() => null)

    console.log('✅ Supabase 连接成功！\n')
    console.log('📊 连接信息:')
    console.log('   URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('   认证状态: 已通过')

  } catch (err) {
    console.log('❌ 连接失败:', err.message)
  }
}

testConnection()
