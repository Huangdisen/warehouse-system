# 仓库管理系统

成品仓库出入库管理系统，基于 Next.js + Supabase + Vercel 构建。

## 功能

- ✅ 用户登录（区分管理员/仓管员）
- ✅ 产品管理（仅管理员可操作）
- ✅ 入库操作
- ✅ 出库操作（带库存校验）
- ✅ 出入库记录查询
- ✅ 库存预警
- ✅ 仪表盘概览

## 部署步骤

### 1. 配置 Supabase

1. 登录 [Supabase](https://supabase.com)，创建新项目
2. 等待项目创建完成
3. 进入 **SQL Editor**，执行 `database.sql` 中的全部 SQL 代码
4. 进入 **Project Settings > API**，复制：
   - Project URL
   - anon public key

### 2. 创建用户

在 Supabase 中：

1. 进入 **Authentication > Users**
2. 点击 **Add User**，创建管理员账号：
   - Email: 你的邮箱
   - Password: 设置密码
   - 勾选 **Auto Confirm User**

3. 进入 **Table Editor > profiles** 表
4. 找到刚创建的用户，修改 `role` 为 `admin`

5. 同样方式创建仓管员账号，`role` 保持默认 `staff`

### 3. 部署到 Vercel

#### 方式一：通过 GitHub（推荐）

1. 将项目上传到 GitHub
2. 登录 [Vercel](https://vercel.com)
3. 点击 **New Project**，导入 GitHub 仓库
4. 配置环境变量：
   ```
   NEXT_PUBLIC_SUPABASE_URL=你的Project URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY=你的anon key
   ```
5. 点击 **Deploy**

#### 方式二：通过 Vercel CLI

```bash
# 安装 Vercel CLI
npm i -g vercel

# 进入项目目录
cd warehouse-system

# 登录并部署
vercel

# 配置环境变量
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY

# 重新部署
vercel --prod
```

### 4. 本地开发（可选）

```bash
# 安装依赖
npm install

# 复制环境变量
cp .env.example .env.local
# 编辑 .env.local，填入 Supabase 配置

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000

## 权限说明

| 功能 | 管理员 | 仓管员 |
|------|--------|--------|
| 查看仪表盘 | ✅ | ✅ |
| 产品管理 | ✅ | ❌ |
| 入库操作 | ✅ | ✅ |
| 出库操作 | ✅ | ✅ |
| 查看记录 | ✅ | ✅ |

## 后续扩展

- Phase 2: 更多筛选条件、导出 Excel
- Phase 3: 库存预警邮件通知
- Phase 4: 统计报表、图表分析
- Phase 5: 半成品仓库模块

## 技术栈

- Next.js 14
- React 18
- Tailwind CSS
- Supabase (PostgreSQL + Auth)
- Vercel
