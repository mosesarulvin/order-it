# order-it — Product Specification

> **Version:** 1.0  
> **Date:** 2026-07-13  
> **Status:** Living document — update as features change.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [User Roles & Access](#4-user-roles--access)
5. [Route Map](#5-route-map)
6. [Feature Specifications](#6-feature-specifications)
   - 6.1 [Menu Management](#61-menu-management)
   - 6.2 [Customer QR Order Flow](#62-customer-qr-order-flow)
   - 6.3 [Kitchen Operations](#63-kitchen-operations)
   - 6.4 [Walk-In POS](#64-walk-in-pos)
   - 6.5 [Coupon System](#65-coupon-system)
   - 6.6 [Review System](#66-review-system)
   - 6.7 [Stock Management](#67-stock-management)
   - 6.8 [Customer Profiles](#68-customer-profiles)
   - 6.9 [QR Code Generation](#69-qr-code-generation)
   - 6.10 [Shop Settings](#610-shop-settings)
   - 6.11 [Dashboard Analytics](#611-dashboard-analytics)
7. [Data Model](#7-data-model)
8. [Business Rules](#8-business-rules)
9. [UI & UX Patterns](#9-ui--ux-patterns)
10. [Realtime Behavior](#10-realtime-behavior)
11. [Security Model](#11-security-model)
12. [Environment & Deployment](#12-environment--deployment)

---

## 1. Overview

**order-it** is a QR-code-based food ordering platform for small food businesses — cafes, quick-service restaurants, and takeaway shops.

### Two surfaces

| Surface | Who uses it | Entry point |
|---------|-------------|-------------|
| **Customer QR ordering** | Walk-in diners scanning a table QR | `/order/:slug` |
| **Staff / admin dashboard** | Shop owner and kitchen staff | `/dashboard` |

### Core value proposition

- Customers scan a QR code → browse menu → order → track their order live.
- Shop owners manage menu, view and progress orders, run kitchen ops, track stock, send coupons, and view analytics — all from a browser.
- No native app required on either side.

### Target users

- **Primary:** Small food businesses in India (INR-first, Indian phone validation).
- **End users:** Walk-in customers with a smartphone.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | React 19 + TypeScript |
| Build tool | Vite 8 |
| Routing | react-router-dom v7 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite` plugin) |
| Component primitives | Custom UI lib + Radix UI (Avatar, Checkbox, Dialog, DropdownMenu, Label, Popover, ScrollArea, Select, Separator, Slot, Switch, Tabs, Toast, Tooltip) |
| Icons | lucide-react |
| Forms & validation | react-hook-form v7 + Zod v4 + @hookform/resolvers |
| Backend / database | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Client SDK | @supabase/supabase-js v2 |
| Global server-state | @tanstack/react-query v5 (QueryClientProvider configured; individual pages use direct Supabase calls) |
| Cart state | Zustand v5 with `persist` middleware (localStorage key: `orderit-cart`) |
| Auth state | React Context (`AuthContext`) |
| Notifications | react-hot-toast |
| QR generation | qrcode |
| Date utilities | date-fns |
| Linting | oxlint |
| Deployment | Vercel (SPA rewrite via `vercel.json`) |

---

## 3. Architecture

```
┌──────────────────────────────────────────────┐
│                  Browser (SPA)                │
│                                               │
│  React 19 + Vite                              │
│  ┌───────────────┐  ┌───────────────────────┐ │
│  │  Auth Context │  │  Zustand Cart Store   │ │
│  │  (shop, user) │  │  (persisted localStorage)│
│  └───────────────┘  └───────────────────────┘ │
│                                               │
│  Pages / Components ──→ supabase-js client    │
└────────────────────────┬─────────────────────┘
                         │ HTTPS + WebSocket
                         ▼
              ┌──────────────────────┐
              │      Supabase        │
              │  ┌────────────────┐  │
              │  │  PostgreSQL    │  │
              │  │  (RLS enabled) │  │
              │  ├────────────────┤  │
              │  │  Auth (JWT)    │  │
              │  ├────────────────┤  │
              │  │  Storage       │  │
              │  │  (menu-images) │  │
              │  ├────────────────┤  │
              │  │  Realtime      │  │
              │  │  (orders table)│  │
              │  └────────────────┘  │
              └──────────────────────┘
```

- **No custom backend.** All database access happens through the Supabase JS client in the browser.
- **RLS (Row Level Security)** on every table enforces data isolation per shop — owners only see their own data.
- **Realtime** subscriptions push order changes to the kitchen, orders dashboard, and customer tracking page over WebSocket.
- **Storage** is a single public bucket (`menu-images`) for menu item images.

---

## 4. User Roles & Access

### 4.1 Shop Owner

- Authenticated via Supabase email/password.
- One shop per owner (1:1 relationship in `shops` table).
- Full CRUD access to their shop, menu, orders, coupons, stock, customers, and settings.
- Dashboard is gated behind `ProtectedRoute` — redirects to `/login` if unauthenticated.

### 4.2 Kitchen Staff

- No separate role exists. Staff log in using the owner's credentials.
- *(Future: role-based access with separate staff accounts.)*

### 4.3 Customer (QR visitor)

- Not authenticated via Supabase Auth.
- May optionally create a **customer profile** identified by phone number (per shop, no password).
- Profile ID stored in `localStorage` under key `profile-{slug}`.
- Can place orders, view order status, submit reviews, and use profile coupons.

### 4.4 Anonymous Customer

- No name required — customer opts in to anonymous mode at checkout.
- `customer_name` = their entered name (or hidden), `customer_phone` = `"Anonymous"`, `is_anonymous = true`.

---

## 5. Route Map

### Public (no auth required)

| Route | Page | Description |
|-------|------|-------------|
| `/order/:slug` | `OrderMenuPage` | Browse menu for a shop identified by slug |
| `/order/:slug/checkout` | `CheckoutPage` | Review cart, enter details, apply coupon, place order |
| `/order/:slug/success/:orderId` | `OrderSuccessPage` | Live order tracking with status timeline |
| `/order/:slug/review/:orderId` | `ReviewPage` | Submit a star rating and comment after order |
| `/order/:slug/profile` | `ProfilePage` | Create or log in to a customer profile by phone |
| `/order/:slug/profile/:profileId` | `ProfileDashboardPage` | View personal coupons and order history |

### Auth routes (redirect to `/dashboard` if already signed in)

| Route | Page | Description |
|-------|------|-------------|
| `/login` | `LoginPage` | Email/password sign in |
| `/register` | `RegisterPage` | Email/password sign up + auto shop creation |
| `/forgot-password` | `ForgotPasswordPage` | Send password reset email |
| `/reset-password` | `ResetPasswordPage` | Set new password via recovery link |

### Protected dashboard routes (redirect to `/login` if not signed in)

| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | `DashboardHome` | Stats overview, recent orders, low-stock alerts |
| `/dashboard/menu` | `MenuPage` | Manage categories and menu items |
| `/dashboard/orders` | `OrdersPage` | View and manage all orders |
| `/dashboard/kitchen` | `KitchenPage` | Kanban kitchen board with realtime updates |
| `/dashboard/stock` | `StockPage` | Adjust and audit item stock levels |
| `/dashboard/coupons` | `CouponsPage` | Create and manage discount coupons |
| `/dashboard/reviews` | `ReviewsPage` | View customer reviews and ratings |
| `/dashboard/customers` | `CustomersPage` | Customer profile list and coupon assignment |
| `/dashboard/walkin` | `WalkInPage` | POS-style screen for staff placing in-person orders |
| `/dashboard/qr` | `QRCodePage` | Generate and download shop QR code |
| `/dashboard/settings` | `SettingsPage` | Shop profile, tax, schedule, feature flags |

### Other

| Route | Behavior |
|-------|----------|
| `/` | Redirect to `/dashboard` |
| `*` | `NotFoundPage` |

---

## 6. Feature Specifications

### 6.1 Menu Management

**Location:** `/dashboard/menu`

#### Categories

- Create, rename, reorder, and soft-delete (toggle `is_active`) categories.
- `sort_order` controls display sequence on both dashboard and customer menu.
- Each category belongs to one shop.

#### Menu Items

Fields per item:

| Field | Type | Description |
|-------|------|-------------|
| `name` | text | Item name |
| `description` | text (nullable) | Short description |
| `price` | numeric | In shop's currency |
| `image_url` | text (nullable) | Public URL from `menu-images` storage bucket |
| `is_available` | boolean | Hides item from customer menu when false |
| `is_popular` | boolean | Marks item with a "Popular" badge |
| `is_instant` | boolean | Item is ready immediately (e.g. pre-made items) |
| `stock_quantity` | integer (nullable) | `null` = not tracked; number = tracked |
| `low_stock_threshold` | integer | Alert threshold (default: 5) |
| `customization_groups` | jsonb | Array of `CustomizationGroup` objects |
| `sort_order` | integer | Display order within category |

#### Image Upload

- Upload to Supabase Storage bucket `menu-images` (public).
- Public URL returned and stored in `image_url`.

#### Customization Groups

Each item can have zero or more customization groups:

```ts
interface CustomizationGroup {
  name: string          // e.g. "Size", "Add-ons"
  type: 'single'        // radio — customer picks exactly one choice
       | 'multi'        // checkbox — customer picks one or more choices
  required: boolean
  choices: string[]     // e.g. ["Small", "Medium", "Large"]
}
```

- Customer selections are stored as `customizations: { group: string; choice: string }[]` on each `order_item`.
- Items with different customization selections are treated as separate cart rows.

---

### 6.2 Customer QR Order Flow

**Entry:** Customer scans a QR code → `/order/:slug`

#### Step 1 — Browse Menu (`OrderMenuPage`)

- Fetches shop by `slug`; shows "Shop is Closed" if `is_open = false`.
- Loads all active categories and available items.
- Instant items (is_instant) may still be orderable even when shop is closed.
- Sticky category tabs for navigation.
- Each item card shows name, description, price, popularity badge, and "Popular" flag.
- Tapping an item with customizations opens a customization modal (choose required and optional options).
- Items without customizations are added directly to cart.
- Cart button in bottom bar shows item count; navigates to checkout.
- Recent order link shown if `localStorage` contains a prior order ID for this slug.

#### Step 2 — Checkout (`CheckoutPage`)

1. **Cart review** — list of items with quantity controls and remove buttons (index-based to support duplicate items with different customizations).
2. **Customer details form:**
   - `customer_name` — required (min 2 chars).
   - `customer_phone` — required unless anonymous; validated as 10-digit Indian mobile starting with 6–9.
   - `notes` — optional, max 200 chars.
3. **Anonymous mode toggle** — hides phone field; sets `is_anonymous = true`.
4. **Coupon input:**
   - Manual code entry with Apply button.
   - Auto-applies coupon from `pending-coupon-{slug}` in localStorage (set by ProfileDashboardPage "Use Now").
   - Auto-applies first unused profile coupon from `profile_coupons` if no pending-coupon hint.
   - Validation: active, not expired, usage limit not reached, subtotal ≥ min_order_amount.
   - Visible only if `coupons_enabled = true` on the shop.
5. **Payment method selector** — UPI or Cash (default: Cash).
6. **Price summary** — Subtotal + Tax − Discount = Total.
7. **Place Order button** — validates all fields, re-checks availability and stock, creates order.

**Order creation sequence:**

```
1. Re-fetch menu_items for availability and stock
2. Reject if any item is unavailable
3. Reject if any cart item qty > item.stock_quantity
4. Determine initial status:
   - All items instant → 'ready'
   - Otherwise → 'pending'
5. INSERT into orders (with all fields)
6. INSERT into order_items (with customizations)
7. For each tracked stock item:
   a. UPDATE menu_items SET stock_quantity -= qty
   b. INSERT stock_logs (reason: 'order')
8. If coupon applied:
   a. UPDATE coupons SET used_count += 1
   b. If profile exists: UPDATE profile_coupons SET used_at, used_order_id
9. clearCart()
10. navigate to /order/:slug/success/:orderId
```

#### Step 3 — Order Tracking (`OrderSuccessPage`)

- Fetches order by ID with items and shop.
- **Realtime subscription** on channel `order-tracking-{orderId}` for `postgres_changes` on orders table, filtered by `id=eq.{orderId}`.
- Visual status timeline: Pending → Confirmed → Preparing → Ready → Completed.
- Cancellation message shown if `status = 'cancelled'` (with reason).
- Payment summary card (subtotal, tax, discount, total, payment method).
- Prompts to:
  - Leave a review (if `reviews_enabled = true` and review not yet submitted — tracked in localStorage).
  - Create a profile (if no profile for this slug in localStorage).

#### Step 4 — Review (`ReviewPage`)

- 1–5 star rating selector.
- Optional comment field.
- Customer name pre-populated from localStorage or prompted.
- INSERTs into `reviews` table with `order_id`, `order_number`, `shop_id`.
- Review submission persisted in localStorage per `order-review-submitted-{orderId}` to prevent duplicate prompts.

---

### 6.3 Kitchen Operations

**Location:** `/dashboard/kitchen`

#### Kanban Board

Four active status columns:

| Column | Status | Color |
|--------|--------|-------|
| New Orders | `pending` | Yellow |
| Confirmed | `confirmed` | Blue |
| Preparing | `preparing` | Orange |
| Ready | `ready` | Green |

- Orders move left-to-right through columns.
- Each card shows: order number, customer name, elapsed time, items list with customizations, total, payment method.
- Urgency indicator based on minutes elapsed since order creation.

#### Actions per order card

- **Previous / Next arrow buttons** — move order to adjacent status.
- **Complete button** — transitions to `completed` and removes from board.
- **Cancel button** — opens `CancelOrderModal`, sets `status = 'cancelled'` with a reason.
- **Cash paid / Mark unpaid** — toggles `payment_status` between `paid` and `pending` for cash orders.
- **Drag and drop** — drag a card to any column to change status. Dragging to "cancelled" column opens cancellation modal.

#### Filters / Sort

- Filter by status column.
- Filter by payment method (all / cash / upi).
- Sort by oldest, newest, or payment status.
- Search by order number or customer name.

#### Realtime

- Channel: `kitchen-{shopId}` — `postgres_changes` on orders table.
- On INSERT: silent refresh + audio notification (WebAudio API oscillator beep) + toast.
- On UPDATE: silent refresh.

---

### 6.4 Walk-In POS

**Location:** `/dashboard/walkin`

- Staff can directly place an order on behalf of a walk-in customer without a QR scan.
- Menu loaded from shop's active categories and items (same as customer menu).
- Cart management identical to customer flow (supports customizations).
- Customer details: name and phone (both optional / free-form for walk-in).
- Coupon support same as checkout.
- Payment method selection (UPI / Cash).
- On submit: same order creation sequence as checkout.
  - `order_source = 'walkin'`, `customer_phone = 'Walk-in'` (when not specified).
  - Same stock deduction and stock_log insertion.

---

### 6.5 Coupon System

#### Coupon Fields

| Field | Type | Description |
|-------|------|-------------|
| `code` | text | Uppercase coupon code; unique per shop |
| `type` | `percentage` \| `amount` | Discount calculation type |
| `coupon_type` | `general` \| `new_user` \| `birthday` \| `promotion` | Category / purpose |
| `value` | numeric | Percentage (0–100) or fixed amount |
| `min_order_amount` | numeric | Minimum subtotal required |
| `max_uses` | integer (nullable) | `null` = unlimited |
| `used_count` | integer | Running counter (incremented on order) |
| `expires_at` | timestamptz (nullable) | `null` = no expiry |
| `is_active` | boolean | Master switch |

#### Discount Calculation

```
if type = 'percentage':
  discount = round(subtotal × value / 100, 2)
if type = 'amount':
  discount = min(value, subtotal)  // never exceed subtotal

total = max(0, subtotal + tax_amount - discount)
```

#### Validation Rules (at checkout Apply and at Submit)

1. Coupon exists in shop's coupons.
2. `is_active = true`.
3. `expires_at` is null OR `expires_at > now()`.
4. `max_uses` is null OR `used_count < max_uses`.
5. Subtotal ≥ `min_order_amount`.

All five conditions must pass; any failure shows a specific error toast.

#### Profile Coupons

- Coupons can be assigned to specific customer profiles via `profile_coupons`.
- **New user welcome coupon:** automatically assigned on profile creation if a `new_user` coupon is active.
- **"Use Now" flow:** ProfileDashboardPage writes coupon code to `pending-coupon-{slug}` in localStorage → CheckoutPage auto-applies it → clears the key after application.
- On order success: `profile_coupons.used_at` and `used_order_id` are set.

#### Dashboard Management

- Create, edit, activate/deactivate coupons.
- View usage stats (used_count / max_uses).
- Filter by status and coupon_type.

---

### 6.6 Review System

#### Submission (Customer)

- Available from `OrderSuccessPage` if `reviews_enabled = true` on the shop.
- Rating: 1–5 stars (required).
- Comment: optional text.
- Customer name: pre-filled from localStorage or input.
- INSERT into `reviews` with `shop_id`, `order_id`, `order_number`, `customer_name`, `rating`, `comment`.

#### Dashboard (`ReviewsPage`)

- Aggregate stats: average rating, total count.
- Star breakdown: percentage and count per star value (1–5).
- Review list with customer name, rating, comment, date, order number.
- Filter by star value.
- Toggle to show only reviews with comments.

---

### 6.7 Stock Management

#### Per-Item Tracking

- Optional per menu item. `stock_quantity = null` means untracked.
- `low_stock_threshold` (default: 5) — items at or below this value appear in the Dashboard Home low-stock alert.

#### Dashboard (`StockPage`)

- Lists all menu items with stock tracking enabled.
- Shows current quantity and low-stock badge.
- **Adjust Stock modal** — enter delta (positive = restock, negative = adjustment), select reason (`restock` or `adjustment`), optional note.
- Modal submits:
  1. UPDATE `menu_items.stock_quantity += delta`.
  2. INSERT `stock_logs` with `delta`, `reason`, `note`.
- **Stock log panel** — recent movement history per item with delta direction, reason, and timestamp.

#### Automatic Deduction (on Order)

- At checkout: `stock_quantity -= quantity` per cart item where `stock_quantity IS NOT NULL`.
- INSERT `stock_logs` with `reason = 'order'`, `note = order_number`, `delta = -quantity`.
- Same logic applies in Walk-In POS.

#### Pre-Order Stock Validation

- At checkout submit: re-fetches `stock_quantity` from DB for all cart items.
- Rejects order if any item's `cart_quantity > current stock_quantity`.

---

### 6.8 Customer Profiles

#### Creation (`ProfilePage`)

- Customer enters name (required), phone (required, validated), email (optional), birthday (optional).
- Phone is unique per shop (`UNIQUE (shop_id, phone)`).
- If profile already exists for that phone: logs in (retrieves existing `id`).
- If new: INSERTs profile and checks for an active `new_user` coupon → inserts `profile_coupons` record.
- Profile ID saved to `localStorage` under `profile-{slug}`.

#### Profile Dashboard (`ProfileDashboardPage`)

- Shows profile coupons:
  - **Available** coupons (unused) with code, label, and "Use Now" button.
  - **Used** coupons with use date and order number.
- Order history: recent orders linked to this profile.
- "Use Now" sets `pending-coupon-{slug}` in localStorage and navigates to checkout.

#### Staff View (`CustomersPage`)

- Lists all customer profiles for the shop (name, phone, email, birthday, join date).
- Per-profile stats: total orders, total spend (calculated from orders).
- Birthday filter to find customers with upcoming birthdays.
- Right-side drawer: profile's assigned coupons + recent order history.
- **Send Coupon** action: assigns a coupon from the shop's active coupon list to the selected profile by inserting into `profile_coupons`.

---

### 6.9 QR Code Generation

**Location:** `/dashboard/qr`

- Generates a QR code image pointing to `{origin}/order/{shop.slug}`.
- Rendered on an HTML `<canvas>` using the `qrcode` library.
- **Download PNG** — canvas exported to data URL and downloaded.
- **Copy link** — copies the menu URL to clipboard.
- Displays the full URL below the QR for manual sharing.

---

### 6.10 Shop Settings

**Location:** `/dashboard/settings`

Fields:

| Field | Type | Description |
|-------|------|-------------|
| `name` | text | Shop display name |
| `description` | text | Optional short description |
| `phone` | text | Contact phone |
| `address` | text | Physical address |
| `tax_percent` | numeric (0–100) | Tax rate applied at checkout |
| `is_open` | boolean | Manual open/closed toggle |
| `coupons_enabled` | boolean | Show coupon input on customer checkout |
| `reviews_enabled` | boolean | Show review prompt on order success page |
| `auto_schedule_enabled` | boolean | Enable time-based auto open/close |
| `auto_open_time` | text (HH:MM) | Time to auto-open (24-hour format) |
| `auto_close_time` | text (HH:MM) | Time to auto-close (24-hour format) |

#### Auto-Schedule Logic

- `DashboardLayout` runs a scheduler on mount when `auto_schedule_enabled = true`.
- Compares current time to `auto_open_time` / `auto_close_time`.
- Updates `shops.is_open` accordingly via Supabase.
- `refreshShop()` called to sync auth context.

---

### 6.11 Dashboard Analytics

**Location:** `/dashboard` (DashboardHome)

#### Stat Cards

| Metric | Calculation |
|--------|------------|
| Today's Revenue | Sum of `total` for orders with `status != 'cancelled'` AND `payment_status = 'paid'` created today |
| Total Orders | Count of all orders (last 90 days) |
| Pending Orders | Count of orders in status `pending`, `confirmed`, or `preparing` |
| Total Revenue | Sum of `total` for paid, non-cancelled orders (last 90 days) |

- Revenue is scoped to last 90 days for query performance.

#### Recent Orders

- Last 5 orders with items, shown in a table with status badge, total, and time.

#### Low Stock Alerts

- All `menu_items` with `stock_quantity IS NOT NULL` where `stock_quantity <= low_stock_threshold`.
- Link to `/dashboard/stock` for management.

#### Realtime

- Channel: `dashboard-{shopId}` — refreshes all data on any order INSERT or UPDATE.

---

## 7. Data Model

### 7.1 `shops`

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | uuid | PK | `uuid_generate_v4()` |
| `owner_id` | uuid | FK → `auth.users(id)` ON DELETE CASCADE | |
| `name` | text | NOT NULL | |
| `slug` | text | NOT NULL, UNIQUE | |
| `description` | text | | |
| `logo_url` | text | | |
| `phone` | text | | |
| `address` | text | | |
| `currency` | text | NOT NULL | `'INR'` |
| `is_open` | boolean | NOT NULL | `true` |
| `tax_percent` | numeric(5,2) | NOT NULL | `0` |
| `coupons_enabled` | boolean | NOT NULL | `true` |
| `reviews_enabled` | boolean | NOT NULL | `true` |
| `auto_schedule_enabled` | boolean | NOT NULL | `false` |
| `auto_open_time` | text | | `null` |
| `auto_close_time` | text | | `null` |
| `created_at` | timestamptz | NOT NULL | `now()` |
| `updated_at` | timestamptz | NOT NULL | `now()` |

Indexes: `shops_slug_idx` (UNIQUE on `slug`)  
Triggers: `shops_updated_at` (sets `updated_at` on UPDATE)

---

### 7.2 `menu_categories`

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | uuid | PK | `uuid_generate_v4()` |
| `shop_id` | uuid | FK → `shops(id)` ON DELETE CASCADE | |
| `name` | text | NOT NULL | |
| `description` | text | | |
| `sort_order` | integer | NOT NULL | `0` |
| `is_active` | boolean | NOT NULL | `true` |
| `created_at` | timestamptz | NOT NULL | `now()` |

Indexes: `menu_categories_shop_idx`

---

### 7.3 `menu_items`

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | uuid | PK | `uuid_generate_v4()` |
| `shop_id` | uuid | FK → `shops(id)` ON DELETE CASCADE | |
| `category_id` | uuid | FK → `menu_categories(id)` ON DELETE CASCADE | |
| `name` | text | NOT NULL | |
| `description` | text | | |
| `price` | numeric(10,2) | NOT NULL | `0` |
| `image_url` | text | | |
| `is_available` | boolean | NOT NULL | `true` |
| `is_popular` | boolean | NOT NULL | `false` |
| `is_instant` | boolean | NOT NULL | `false` |
| `stock_quantity` | integer | (nullable) | `null` |
| `low_stock_threshold` | integer | NOT NULL | `5` |
| `customization_groups` | jsonb | | `'[]'` |
| `sort_order` | integer | NOT NULL | `0` |
| `created_at` | timestamptz | NOT NULL | `now()` |
| `updated_at` | timestamptz | NOT NULL | `now()` |

Indexes: `menu_items_shop_idx`, `menu_items_category_idx`  
Triggers: `menu_items_updated_at`

---

### 7.4 `orders`

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | uuid | PK | `uuid_generate_v4()` |
| `shop_id` | uuid | FK → `shops(id)` ON DELETE CASCADE | |
| `order_number` | text | NOT NULL | |
| `customer_name` | text | NOT NULL | |
| `customer_phone` | text | NOT NULL | |
| `status` | text | NOT NULL, CHECK ∈ {`pending`,`confirmed`,`preparing`,`ready`,`completed`,`cancelled`} | `'pending'` |
| `payment_method` | text | NOT NULL, CHECK ∈ {`upi`,`cash`} | `'cash'` |
| `payment_status` | text | NOT NULL, CHECK ∈ {`pending`,`paid`,`failed`} | `'pending'` |
| `subtotal` | numeric(10,2) | NOT NULL | `0` |
| `tax_amount` | numeric(10,2) | NOT NULL | `0` |
| `discount_amount` | numeric(10,2) | NOT NULL | `0` |
| `total` | numeric(10,2) | NOT NULL | `0` |
| `notes` | text | | |
| `cancellation_reason` | text | | |
| `is_anonymous` | boolean | NOT NULL | `false` |
| `coupon_code` | text | | `null` |
| `order_source` | text | NOT NULL, CHECK ∈ {`qr`,`walkin`} | `'qr'` |
| `customer_profile_id` | uuid | FK → `customer_profiles(id)` ON DELETE SET NULL | |
| `created_at` | timestamptz | NOT NULL | `now()` |
| `updated_at` | timestamptz | NOT NULL | `now()` |

Indexes: `orders_shop_idx`, `orders_status_idx`, `orders_created_idx`, `orders_order_source_idx`, `orders_profile_id_idx`  
Triggers: `orders_updated_at`  
Realtime: published via `supabase_realtime`

---

### 7.5 `order_items`

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | uuid | PK | `uuid_generate_v4()` |
| `order_id` | uuid | FK → `orders(id)` ON DELETE CASCADE | |
| `menu_item_id` | uuid | FK → `menu_items(id)` ON DELETE SET NULL | |
| `name` | text | NOT NULL | (snapshot at order time) |
| `price` | numeric(10,2) | NOT NULL | |
| `quantity` | integer | NOT NULL | `1` |
| `subtotal` | numeric(10,2) | NOT NULL | |
| `customizations` | jsonb | | `'[]'` |
| `created_at` | timestamptz | NOT NULL | `now()` |

Note: `name` and `price` are snapshotted at order time so menu changes don't affect historical orders. `menu_item_id` is nullable (SET NULL on item deletion).

Indexes: `order_items_order_idx`

---

### 7.6 `stock_logs`

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | uuid | PK | `uuid_generate_v4()` |
| `shop_id` | uuid | FK → `shops(id)` ON DELETE CASCADE | |
| `menu_item_id` | uuid | FK → `menu_items(id)` ON DELETE SET NULL | |
| `item_name` | text | NOT NULL | |
| `delta` | integer | NOT NULL | |
| `reason` | text | NOT NULL, CHECK ∈ {`order`,`restock`,`adjustment`} | |
| `note` | text | | |
| `created_at` | timestamptz | NOT NULL | `now()` |

Indexes: `stock_logs_shop_idx`, `stock_logs_item_idx`, `stock_logs_created_idx`

---

### 7.7 `coupons`

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | uuid | PK | `uuid_generate_v4()` |
| `shop_id` | uuid | FK → `shops(id)` ON DELETE CASCADE | |
| `code` | text | NOT NULL, UNIQUE (shop_id, code) | |
| `type` | text | NOT NULL, CHECK ∈ {`percentage`,`amount`} | |
| `coupon_type` | text | NOT NULL, CHECK ∈ {`general`,`new_user`,`birthday`,`promotion`} | `'general'` |
| `value` | numeric(10,2) | NOT NULL | |
| `min_order_amount` | numeric(10,2) | NOT NULL | `0` |
| `max_uses` | integer | (nullable) | `null` |
| `used_count` | integer | NOT NULL | `0` |
| `expires_at` | timestamptz | (nullable) | `null` |
| `is_active` | boolean | NOT NULL | `true` |
| `created_at` | timestamptz | NOT NULL | `now()` |

Indexes: `coupons_shop_idx`

---

### 7.8 `reviews`

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | uuid | PK | `gen_random_uuid()` |
| `shop_id` | uuid | FK → `shops(id)` ON DELETE CASCADE | |
| `order_id` | uuid | FK → `orders(id)` ON DELETE SET NULL | |
| `order_number` | text | | |
| `customer_name` | text | NOT NULL | `'Guest'` |
| `rating` | integer | NOT NULL, CHECK BETWEEN 1 AND 5 | |
| `comment` | text | | |
| `created_at` | timestamptz | NOT NULL | `now()` |

Indexes: `reviews_shop_id_idx`, `reviews_order_id_idx`

---

### 7.9 `customer_profiles`

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | uuid | PK | `gen_random_uuid()` |
| `shop_id` | uuid | FK → `shops(id)` ON DELETE CASCADE | |
| `name` | text | NOT NULL | |
| `phone` | text | NOT NULL | |
| `email` | text | | |
| `birthday` | date | | |
| `created_at` | timestamptz | NOT NULL | `now()` |

Constraints: UNIQUE `(shop_id, phone)`  
Indexes: `customer_profiles_shop_id_idx`, `customer_profiles_phone_idx`

---

### 7.10 `profile_coupons`

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | uuid | PK | `gen_random_uuid()` |
| `profile_id` | uuid | FK → `customer_profiles(id)` ON DELETE CASCADE | |
| `shop_id` | uuid | FK → `shops(id)` ON DELETE CASCADE | |
| `coupon_id` | uuid | FK → `coupons(id)` ON DELETE SET NULL | |
| `coupon_code` | text | NOT NULL | |
| `label` | text | NOT NULL | e.g. "Welcome 10% off" |
| `assigned_at` | timestamptz | NOT NULL | `now()` |
| `used_at` | timestamptz | | |
| `used_order_id` | uuid | FK → `orders(id)` ON DELETE SET NULL | |

Indexes: `profile_coupons_profile_id_idx`, `profile_coupons_shop_id_idx`

---

## 8. Business Rules

### 8.1 Order Status State Machine

```
                ┌──────────┐
         ┌─────►│ pending  │──────────────────────┐
         │      └────┬─────┘                      │
         │           │ (staff confirms)            │
         │      ┌────▼─────┐                      │
         │      │confirmed │──────────────────────┤
         │      └────┬─────┘                      │
         │           │ (kitchen starts prep)       │ cancel
         │      ┌────▼─────┐                      │
         │      │preparing │──────────────────────┤
         │      └────┬─────┘                      │
         │           │ (food ready)               │
         │      ┌────▼─────┐                      │
         │      │  ready   │──────────────────────┤
         │      └────┬─────┘                      │
         │           │ (customer collects)        │
         │      ┌────▼─────┐                ┌─────▼──────┐
         └──────│completed │                │ cancelled  │
    (kitchen    └──────────┘                └────────────┘
    prev button)
```

- **Auto-skip:** If all cart items have `is_instant = true`, order is created with `status = 'ready'`.
- **Kitchen prev/next buttons:** Allow moving one step forward or one step backward for corrections.
- **Drag-and-drop:** Any non-terminal status is valid as a drop target. Dragging to cancelled triggers the cancellation modal.
- **Completed and cancelled are terminal** — no further status changes possible in UI.
- `cancellation_reason` must be captured on cancel (via `CancelOrderModal`).

### 8.2 Coupon Validation Rules

All five conditions must pass at both "Apply" click and final "Place Order" submit:

1. Coupon `code` found in `coupons` table scoped to `shop_id`.
2. `is_active = true`.
3. `expires_at IS NULL` OR `expires_at > now()`.
4. `max_uses IS NULL` OR `used_count < max_uses`.
5. `subtotal >= min_order_amount`.

Discount is re-validated against the live subtotal at submit time because cart quantities may have changed since coupon was applied.

### 8.3 Stock Deduction Rules

- Only items where `stock_quantity IS NOT NULL` are tracked.
- On order creation: `new_stock = max(0, current_stock - cart_qty)`.
- On deduction: always INSERT a `stock_log` record with `reason = 'order'`.
- Pre-order check: if `cart_qty > current_stock`, order is blocked with an error toast.
- Manual adjustments (restock / adjustment) go through the Stock page and also INSERT `stock_log` records.

### 8.4 Auto-Schedule Logic

- Checked when `DashboardLayout` mounts, only when `auto_schedule_enabled = true`.
- Compares `HH:MM` of current local time against `auto_open_time` and `auto_close_time`.
- If current time is between open and close times: sets `is_open = true`.
- If outside that window: sets `is_open = false`.
- Changes are written to `shops` table and `refreshShop()` is called to sync auth context.
- No background job or cron — runs only when the dashboard is open.

### 8.5 Anonymous Ordering

- Triggered by "Order Anonymously" toggle on checkout.
- `is_anonymous = true`, `customer_phone = 'Anonymous'`.
- Customer name is still required.
- No profile linkage possible in anonymous mode.

### 8.6 Instant Item Logic

- Items with `is_instant = true` are typically pre-made (e.g. bottled drinks, packaged snacks).
- Instant items can be ordered even when `shop.is_open = false`.
- If **all** items in the cart are instant, the order's initial `status = 'ready'` — no kitchen preparation needed.
- Mixed carts (instant + non-instant) start at `pending`.

### 8.7 Profile Auto-Coupon Assignment

- On profile creation (new phone, not existing): system queries for active `new_user` coupon.
- If found: inserts `profile_coupons` record with label `"Welcome X% off"` or `"Welcome ₹X off"`.
- Only one auto-assignment per creation event; no re-assignment on subsequent logins.

### 8.8 Order Number Format

Generated client-side: `ORD-{last6DigitsOfTimestamp}-{3RandomAlphanumeric}` (e.g. `ORD-823741-K9P`).

---

## 9. UI & UX Patterns

### 9.1 Design System Primitives

| Component | File | Purpose |
|-----------|------|---------|
| `Button` | `components/ui/Button.tsx` | Primary, secondary, ghost, destructive variants; sizes sm/md/lg; loading spinner state |
| `Input` | `components/ui/Input.tsx` | Text input and Textarea with label, error, prefix/suffix icon support |
| `Card` | `components/ui/Card.tsx` | `Card`, `CardHeader`, `CardContent`, `CardFooter`, `CardTitle` composables |
| `Modal` | `components/ui/Modal.tsx` | Generic overlay with ESC key and backdrop click to close |
| `Badge` | `components/ui/Badge.tsx` | Status/semantic label chips |
| `Toggle` | `components/ui/Toggle.tsx` | Custom on/off switch |
| `Skeleton` | `components/ui/Skeleton.tsx` | Animated loading placeholders; `MenuItemSkeleton` and `OrderCardSkeleton` variants |

### 9.2 Loading States

- Dashboard pages show `Skeleton` components during initial data fetch.
- Supabase queries are awaited inline with `useState(true)` loading flags.
- Order creation shows a `Button` loading spinner while the async sequence runs.

### 9.3 Toast Notifications

- `react-hot-toast` is globally configured in `main.tsx`.
- Success toasts: green, for completed actions.
- Error toasts: red, for validation failures or API errors.
- Info toasts: neutral, for state changes (e.g. "Profile already exists!").

### 9.4 Color Palette

- **Brand:** Orange-500 / Amber-500 (primary gradient for headers and CTAs).
- **Status colors:**
  - Pending → Yellow
  - Confirmed → Blue
  - Preparing → Orange
  - Ready → Green
  - Completed → Gray
  - Cancelled → Red

### 9.5 Responsive Layout

- **Customer pages:** Mobile-first, single-column, designed for ~375px phone screens.
- **Dashboard:** Desktop-first with a collapsible sidebar. Mobile-responsive with a hamburger drawer.

---

## 10. Realtime Behavior

| Page | Channel Name | Table Watched | Events | Action on Event |
|------|-------------|---------------|--------|-----------------|
| `DashboardHome` | `dashboard-{shopId}` | `orders` | INSERT, UPDATE | Refetch all stats |
| `OrdersPage` | `orders-{shopId}` | `orders` | INSERT, UPDATE | Refetch orders list |
| `KitchenPage` | `kitchen-{shopId}` | `orders` | INSERT → silent refresh + audio bell + toast; UPDATE → silent refresh |
| `OrderSuccessPage` | `order-tracking-{orderId}` | `orders` | UPDATE (filtered by `id=eq.{orderId}`) | Update displayed status |

- All subscriptions are cleaned up on component unmount (`channel.unsubscribe()`).
- Kitchen audio: generated via WebAudio API (two-tone oscillator beep) — no audio files needed.
- Realtime is enabled on the `orders` table via `ALTER PUBLICATION supabase_realtime ADD TABLE orders` (migration 002).

---

## 11. Security Model

### 11.1 Row Level Security (RLS) Policies

All tables have RLS enabled. Summary:

| Table | Owner Policy | Public Policy |
|-------|-------------|--------------|
| `shops` | All operations where `owner_id = auth.uid()` | SELECT: `true` (public read) |
| `menu_categories` | All where shop owner | SELECT: `is_active = true` |
| `menu_items` | All where shop owner | SELECT: `is_available = true` |
| `orders` | All where shop owner | INSERT: `true`; SELECT: `true` |
| `order_items` | All where order's shop owner | INSERT: `true`; SELECT: `true` |
| `stock_logs` | All where shop owner | None |
| `coupons` | All where shop owner | SELECT: `is_active = true` |
| `reviews` | SELECT where shop owner | INSERT: `true` |
| `customer_profiles` | SELECT where shop owner | INSERT: `true`; SELECT: `auth.uid() IS NULL` |
| `profile_coupons` | SELECT, INSERT, UPDATE where shop owner | SELECT: `true`; UPDATE: `true` (used_at only) |

### 11.2 Auth Route Guards

- `ProtectedRoute`: wraps all `/dashboard/*` routes. Redirects to `/login` if `user` is null.
- `AuthRoute`: wraps `/login`, `/register`, `/forgot-password`. Redirects to `/dashboard` if already signed in.
- `/reset-password` is not wrapped in `AuthRoute` — must be accessible from email links before session is established.

### 11.3 Client-Side Validation

- Phone numbers validated as 10-digit Indian mobile (`/^[6-9]\d{9}$/`) before order submission.
- All forms use Zod schemas validated via `react-hook-form`.
- Stock and availability re-validated server-side (via Supabase query) at order submit, not just client-side.

### 11.4 Known Risks

| Risk | Severity | Notes |
|------|----------|-------|
| `profile_coupons` UPDATE policy allows any anonymous user to set `used_at` on any row | Medium | Mitigated by obscurity of UUID, but a guessed/leaked `profile_id` could mark coupons as used |
| Orders SELECT policy is `true` (any user can read any order by ID) | Low | Order IDs are UUIDs (unguessable); however, order data (customer name, phone) is exposed |
| `customer_profiles` SELECT policy for non-owners is `auth.uid() IS NULL` | Low | Authenticated non-owners cannot read profiles, but unauthenticated users can read all profiles via anon key |
| `.env` file with real credentials may be committed | High | Supabase anon keys are designed to be public (RLS is the security layer), but the file should be in `.gitignore` |
| Order number generated client-side | Low | Collisions theoretically possible under high concurrency; no DB-level uniqueness constraint |

---

## 12. Environment & Deployment

### 12.1 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase public anon key (exposed in client bundle — normal for Supabase) |

Create `.env` from `.env.example`:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

### 12.2 Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `vite` | Start local dev server |
| `build` | `tsc -b && vite build` | Type-check and build for production |
| `preview` | `vite preview` | Preview production build locally |
| `lint` | `oxlint` | Run linter |

### 12.3 Vite Configuration

- Plugin: `@vitejs/plugin-react` for React Fast Refresh.
- Plugin: `@tailwindcss/vite` for Tailwind CSS v4 integration.
- Path alias: `@` → `./src` (configured in `vite.config.ts` and `tsconfig.app.json`).

### 12.4 TypeScript Configuration

- `tsconfig.json` — root references config.
- `tsconfig.app.json` — app source; targets ES2020, `bundler` module resolution, strict mode.
- `tsconfig.node.json` — Vite config file.

### 12.5 Deployment (Vercel)

`vercel.json` configures a catch-all SPA rewrite:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

All routes are served by `index.html`; client-side router handles navigation.

### 12.6 Supabase Setup

1. Create a Supabase project.
2. Run migrations in order (001 → 006) in the Supabase SQL Editor.
3. Create Storage bucket `menu-images` (public) via the Supabase dashboard.
4. Realtime is enabled on `orders` by migration 002.
5. Set env vars in `.env` (local) and Vercel project settings (production).

---

*End of SPEC.md*
