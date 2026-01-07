# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

百越仓库管理系统 (Baiyue Warehouse Management System) - A warehouse inventory management system for finished and semi-finished products, built with Next.js, Supabase, and deployed on Vercel.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (runs on http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Environment Setup

Required environment variables (`.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key

## Database Architecture

### Key Concepts

1. **Two-Tier Warehouse System**: The system manages both finished products (`warehouse='finished'`) and semi-finished products (`warehouse='semi'`)
2. **Role-Based Access**: Two user roles defined in `profiles` table:
   - `admin` - Full access including product management
   - `staff` - Limited access (cannot manage products)
3. **Production Workflow**: Production staff submit production records which warehouse staff must confirm before inventory is updated

### Database Tables (Supabase)

All tables use Row Level Security (RLS) with policies defined in `database.sql`:

- **profiles** - User profiles extending Supabase Auth
  - Automatically created via trigger `on_auth_user_created`
  - Links to `auth.users` via `id` (UUID)

- **products** - Product catalog
  - Fields: `name`, `spec`, `warehouse`, `prize_type`, `quantity`, `warning_qty`
  - Only admins can insert/update/delete; all authenticated users can read

- **customers** - Customer information
  - All authenticated users can read and write

- **stock_records** - Inventory transaction log
  - Links to `products`, `profiles` (operator), and optionally `customers`
  - Type: `'in'` or `'out'`
  - Trigger `on_stock_record_created` automatically updates product quantities
  - Includes `production_date` for tracking manufactured goods

- **production_records** - Production submissions requiring confirmation
  - Status: `'pending'`, `'confirmed'`, or `'rejected'`
  - Links to `profiles` for both submitter and confirmer

- **production_record_items** - Line items for production records
  - Warehouse field can be: `'finished'`, `'semi'`, `'label_semi'`, or `'label_semi_out'`
  - `'label_semi'` indicates converting semi-finished to finished products
  - `'label_semi_out'` is automatically created for tracking the semi-finished outflow

### Indexes

See `database.sql` lines 249-259 for performance-optimized indexes on frequently queried fields.

## Application Architecture

### Route Structure

This is a Next.js 14 App Router application with the following page structure:

```
app/
├── page.js              # Root redirects to /login or /dashboard
├── login/page.js        # Authentication
├── dashboard/page.js    # Overview statistics
├── products/page.js     # Product management (admin only)
├── inventory/page.js    # Inventory counting/adjustment
├── customers/page.js    # Customer CRUD
├── stock/
│   ├── in/page.js      # Inbound stock operations
│   └── out/page.js     # Outbound stock operations
├── production/
│   ├── page.js         # Submit production records (admin only)
│   └── confirm/page.js # Confirm production into inventory
└── records/page.js     # Transaction history

```

### Shared Components

- **DashboardLayout** (`components/DashboardLayout.js`)
  - Wrapper for all authenticated pages
  - Handles auth state, redirects to `/login` if not authenticated
  - Fetches user profile and passes to Sidebar
  - Provides `onProfileUpdate` callback for real-time profile changes

- **Sidebar** (`components/Sidebar.js`)
  - Navigation menu with role-based visibility
  - Real-time pending production count badge (polls every 30 seconds)
  - User profile display with editable nickname
  - Admin-only menu items hidden for staff users

### State Management Pattern

Pages follow a consistent pattern:
1. Client components using `'use client'` directive
2. Local state with `useState` for forms and UI
3. `useEffect` for data fetching on mount
4. Direct Supabase client calls (no server-side API routes)
5. Real-time auth state monitoring via `supabase.auth.onAuthStateChange`

### Authentication Flow

1. Root page (`app/page.js`) checks session and redirects
2. All dashboard pages wrapped in `DashboardLayout` which enforces authentication
3. Auth state persisted in Supabase session
4. Logout handled via `supabase.auth.signOut()`

## Important Implementation Details

### Stock Quantity Updates

**CRITICAL**: Never manually update `products.quantity`. The database trigger `update_product_quantity()` automatically handles this when records are inserted into `stock_records`. Violating this will cause data inconsistencies.

### Production Record Workflow

The "label semi-finished" (`label_semi`) workflow is complex:
1. User selects a semi-finished product and target finished product
2. On submission, TWO records are created in `production_record_items`:
   - One with `warehouse='label_semi'` and `product_id` = target finished product
   - One with `warehouse='label_semi_out'` and `product_id` = source semi-finished product
3. When confirming, both records must be processed to update inventory correctly

See `app/production/page.js:131-142` and `app/production/confirm/page.js` for implementation.

### Number Input Protection

All quantity inputs include `onWheel={(e) => e.target.blur()}` to prevent accidental scrollwheel changes. This is a deliberate UX decision based on user feedback.

### Product Sorting

Products display sorted by `quantity` in inventory views to show low-stock items first. See recent commit "feat: 防止数字输入框滚轮误操作 & 产品按库存排序".

## Code Conventions

- **Language**: UI text is in Chinese (Simplified)
- **Date format**: ISO 8601 (`YYYY-MM-DD`) for date fields
- **Client-side rendering**: All pages use `'use client'` as they require hooks
- **Styling**: Tailwind CSS utility classes, no CSS modules
- **Icons**: Emoji used for visual elements instead of icon libraries
- **Error handling**: Alert dialogs for user-facing errors (consistent with existing pattern)

## Common Pitfalls

1. **RLS Policies**: When adding features that query Supabase, ensure RLS policies permit the operation for the user's role
2. **Warehouse Filtering**: Always filter by `warehouse` when appropriate - don't mix finished/semi-finished products
3. **Foreign Key Constraints**: `production_record_items.product_id` uses `on delete restrict` (not cascade) to prevent accidental data loss
4. **Stock Validation**: Outbound operations must check available quantity - this is enforced at database level in the trigger (line 225-227 in `database.sql`)

## Deployment

- **Platform**: Vercel
- **Database**: Supabase (PostgreSQL + Auth)
- **Initial setup**: Execute `database.sql` in Supabase SQL Editor before first deployment
- **User creation**: Create users via Supabase Dashboard, then manually set role in `profiles` table

## Future Roadmap

Per README.md:
- Phase 2: Enhanced filtering, Excel export
- Phase 3: Low stock email notifications
- Phase 4: Statistical reports and charts
- Phase 5: Semi-finished warehouse module expansion
