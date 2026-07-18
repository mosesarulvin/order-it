# Strategic Review: Transforming **order-it** into a Multi-Business SaaS Platform

## Executive assessment

Your application is already a strong **restaurant-ordering MVP**. It covers more than a basic QR menu: customer ordering, POS, kitchen operations, inventory, coupons, reviews, customer profiles, real-time tracking, analytics, and tenant-level data isolation. The specification also shows thoughtful implementation details such as historical item snapshots, optional inventory tracking, order-state handling, responsive customer screens, and Row Level Security.

However, the current product is fundamentally designed around this assumption:

> **One owner → one shop → one restaurant workflow → one menu → one kitchen-oriented order lifecycle.**

To become a platform that can onboard many kinds of businesses, it needs to evolve toward:

> **Organization → multiple locations → multiple users → configurable business modules → configurable workflows → subscription-based platform.**

My primary recommendation is **not** to immediately make the current application support every business type. That would create an overly generic and difficult-to-maintain product.

Instead, build a reusable **business operating platform** with:

1. A common SaaS foundation.
2. A configurable catalog and transaction engine.
3. Industry-specific modules.
4. Industry-specific onboarding templates.
5. APIs and integrations.
6. Strong tenant security and transactional backend operations.

A realistic positioning would be:

> **A modular commerce and operations platform for appointment-based, order-based, and retail/service businesses.**

---

# 1. What is already strong

## 1.1 Good product completeness for the restaurant vertical

The current feature set already covers the core lifecycle:

- Business setup
- Catalog/menu administration
- Customer ordering
- Staff-entered walk-in orders
- Kitchen fulfillment
- Payment method selection
- Inventory deduction
- Coupon application
- Customer profiles
- Reviews
- Operational analytics

This means you have already implemented several reusable platform concepts, even though they currently have restaurant-specific names.

For example:

| Current concept | Future platform concept |
|---|---|
| Shop | Business location |
| Menu category | Catalog category |
| Menu item | Product or service |
| Kitchen board | Fulfillment workflow board |
| Order | Transaction |
| Customer profile | Business customer |
| Coupon | Promotion |
| Stock | Inventory |
| QR ordering | Customer storefront |
| Walk-in POS | Assisted checkout |
| Shop settings | Location configuration |

## 1.2 Solid starting technology stack

React, TypeScript, PostgreSQL, Supabase Auth, Storage, Realtime, RLS, TanStack Query, Zod, and Vercel provide a productive foundation for an MVP and an early SaaS product. The use of PostgreSQL is especially valuable because the future platform will need relational integrity across businesses, locations, users, roles, subscriptions, transactions, and inventory.

## 1.3 Useful multi-tenant foundation

Almost every major table already contains `shop_id`, and RLS is being used for shop-level isolation. This is a good first step toward tenancy.

However, `shop_id` should eventually stop being your top-level tenant identifier. A more scalable hierarchy is:

```text
Platform
└── Organization / Tenant
    ├── Business configuration
    ├── Subscription
    ├── Users and roles
    └── Locations
        ├── Catalog
        ├── Orders
        ├── Inventory
        ├── Staff
        └── Customers
```

## 1.4 Thoughtful historical data handling

Storing item name and price snapshots in `order_items` is correct. It ensures that changing or removing a catalog item does not rewrite historical orders.

This pattern should be expanded to store:

- Tax snapshot
- Discount allocation
- Product/service configuration snapshot
- Customization price snapshot
- Customer-facing label snapshot
- Seller/location details used at transaction time
- Currency snapshot
- Fulfillment rule snapshot

---

# 2. The most important problems to fix first

Before expanding to other business types, the current architecture needs a stability and security phase.

## 2.1 Order creation is not atomic

The documented checkout process performs multiple separate client-side operations:

1. Insert order.
2. Insert order items.
3. Update stock.
4. Insert stock logs.
5. Increment coupon usage.
6. Mark a profile coupon as used.

This is the highest architectural risk.

If step 4 or 5 fails after the order is inserted, you can end up with:

- An order without complete items.
- Stock deducted only partially.
- A coupon used without a valid order.
- An order created without stock deduction.
- Two customers purchasing the last available item.
- `used_count` exceeding the coupon limit.

### Required improvement

Create a server-side transactional operation, such as:

```text
place_order()
```

It must run inside one PostgreSQL transaction and perform:

```text
Validate tenant and location
Validate current prices
Validate product availability
Lock inventory rows
Validate coupon eligibility
Calculate trusted totals
Generate order number
Insert order
Insert order lines
Deduct or reserve inventory
Create stock movements
Redeem coupon
Create audit event
Commit transaction
```

If any operation fails, everything must roll back.

This can initially be implemented using a Supabase PostgreSQL RPC function. Later, you may move orchestration into an API service without changing the frontend contract.

## 2.2 Prices and totals must not be trusted from the browser

The current client handles discount calculation, tax calculation, and the order creation sequence. Even if the UI validates them correctly, an attacker can call the Supabase API directly with modified totals.

The server must independently calculate:

```text
subtotal
discount
tax
service charge
delivery charge
rounding adjustment
grand total
```

The browser should submit only:

- Item/product identifiers
- Selected variants or options
- Quantities
- Coupon code
- Fulfillment choice
- Customer-provided information
- Payment preference

The server should determine all monetary values.

## 2.3 Public data-access policies expose customer information

The specification explicitly identifies that:

- Public users can select orders.
- Unauthenticated users can select customer profiles.
- Public users can update profile-coupon usage.
- Order records contain customer names and phone numbers.

These should be classified as **release-blocking security issues**, not low- or medium-severity concerns.

A UUID is not an authorization mechanism. IDs can leak through:

- Browser history
- Screenshots
- Shared links
- Analytics
- Error tracking
- Referrer headers
- Application logs
- Support conversations

### Required replacement

For customer order tracking, use one of these methods:

- A time-limited signed tracking token.
- Order ID plus a separate tracking secret.
- OTP verification using the customer phone number.
- An authenticated customer session.

The customer should receive only a safe projection of the order, not the owner-facing database record.

For customer profiles, replace phone-only retrieval and localStorage identity with:

- OTP-based authentication.
- A signed, expiring customer session.
- Rate limiting.
- Bot protection.
- Tenant/location-scoped access.

## 2.4 No trusted backend boundary

A browser-only Supabase client can work for simple CRUD, but it becomes dangerous when the product includes:

- Payments
- Inventory consistency
- Refunds
- Subscription billing
- Coupon redemption
- Staff invitations
- Webhooks
- Notifications
- File security
- Integration credentials
- Cross-location reporting

The platform needs a trusted execution layer.

### Recommended evolution

```text
Customer storefront / Admin portal / Staff workspace
                         |
                    Platform API
                         |
    ------------------------------------------------
    |           |           |          |           |
PostgreSQL   Payments   Messaging   Jobs/Queue   Storage
```

You do **not** need to begin with microservices. Start with a **modular monolith**:

- One API deployment.
- Clearly separated domain modules.
- PostgreSQL as the system of record.
- Background worker for asynchronous jobs.
- Versioned internal events.

That will be easier to operate than many small services.

## 2.5 Scheduling cannot depend on an open dashboard

The auto-open/close scheduler currently executes only when `DashboardLayout` is mounted. That means a shop may remain open or closed incorrectly when nobody has the dashboard open.

Move scheduling to:

- A scheduled server job.
- A Supabase cron/Edge Function.
- Or computed availability based on configured schedule.

The best design is usually to calculate effective availability:

```text
effective_open =
    location_enabled
    AND current_time_in_location_timezone is within schedule
    AND no active closure/holiday applies
    AND ordering_channel_enabled
```

A manual override should have a clear expiry.

## 2.6 Staff sharing the owner's credentials must be removed

The specification currently says kitchen staff use the owner's credentials.

This creates problems with:

- Accountability
- Password sharing
- Employee offboarding
- Least-privilege access
- Fraud investigation
- Audit history
- Multi-location assignments

Implement proper users, memberships, roles, and permissions before adding more business modules.

---

# 3. Recommended platform vision

## 3.1 Product architecture

Your future application should be divided into four layers.

### Layer 1: Platform core

Available to every business:

- Tenant onboarding
- Organization management
- Location management
- User invitations
- Roles and permissions
- Subscription and billing
- Customer management
- Notifications
- Audit logs
- Files and branding
- Reports
- Import/export
- API keys
- Webhooks
- Feature entitlements
- Support tools

### Layer 2: Commerce core

Shared by businesses that sell something:

- Catalog
- Products and services
- Variants
- Add-ons
- Pricing
- Taxes
- Discounts
- Cart
- Checkout
- Orders
- Payments
- Refunds
- Receipts
- Inventory
- Customer credits
- Loyalty

### Layer 3: Operational modules

Enabled based on business requirements:

- Kitchen display
- Appointment booking
- Queue/token management
- Delivery management
- Table management
- Staff scheduling
- Work orders
- Invoicing
- Procurement
- Vendor management
- Memberships
- Rental management

### Layer 4: Industry templates

Templates configure the platform for a specific vertical:

| Template | Enabled modules |
|---|---|
| Restaurant/cafe | Catalog, QR ordering, POS, kitchen, table service, inventory |
| Salon/spa | Services, staff, appointments, reminders, packages, commissions |
| Clinic | Appointments, practitioners, queues, invoices, consent documents |
| Retail store | Products, variants, barcode POS, inventory, suppliers, returns |
| Repair center | Service requests, work orders, parts, technicians, status tracking |
| Tuition center | Students, batches, schedules, attendance, fees |
| Professional services | Leads, clients, appointments, quotations, invoices |
| Rental business | Assets, availability, booking, deposit, check-in/check-out |

Do not implement all these immediately. The template model defines your architectural direction.

---

# 4. Domain model transformation

## 4.1 Replace `shop` with organization and location

Your current `shops` table combines:

- Tenant identity
- Owner relationship
- Operational location
- Branding
- Tax settings
- Business schedule
- Feature settings

These should be separated.

### Proposed model

```text
organizations
- id
- name
- legal_name
- business_type
- default_currency
- default_timezone
- status
- subscription_account_id

locations
- id
- organization_id
- name
- slug
- phone
- address
- timezone
- currency
- operational_status

organization_members
- organization_id
- user_id
- role_id
- status

location_members
- location_id
- user_id
- role_id
```

This supports:

- One owner with multiple branches.
- A manager assigned to certain branches.
- One centralized catalog with local pricing.
- Organization-level reporting.
- Per-location inventory.
- Subscription limits based on users and locations.

## 4.2 Generalize menu into catalog

Rename restaurant-specific entities:

```text
menu_categories  → catalog_categories
menu_items       → catalog_items
customizations   → option_groups and option_values
```

Do not continue storing customization groups only as JSONB. The current JSONB model is convenient for an MVP, but it is difficult to:

- Change option pricing.
- Track inventory per option.
- Query popular options.
- Reuse an option group across items.
- Disable one option.
- Support variants such as size and color.
- Maintain referential integrity.

### Recommended structure

```text
catalog_items
- id
- organization_id
- item_type: product | service | package | rental
- name
- description
- base_price
- tax_category_id
- status

item_variants
- id
- item_id
- sku
- variant_name
- price_override
- barcode

option_groups
- id
- name
- selection_type
- minimum_selections
- maximum_selections

option_values
- id
- option_group_id
- name
- price_adjustment
- status

item_option_groups
- item_id
- option_group_id
```

This can support a pizza topping, salon service add-on, retail product variant, or repair-service option.

## 4.3 Generalize the order lifecycle

The current status workflow is hard-coded as:

```text
pending → confirmed → preparing → ready → completed
```

That is specific to food preparation.

A generic platform should distinguish:

```text
Commercial status:
draft | placed | confirmed | cancelled | completed

Payment status:
unpaid | authorized | partially_paid | paid | partially_refunded | refunded | failed

Fulfillment status:
unfulfilled | scheduled | in_progress | ready | fulfilled | cancelled
```

Industry modules can add domain-specific workflows:

```text
Restaurant:
accepted → preparing → ready → served

Salon:
booked → checked_in → in_service → completed

Repair shop:
received → diagnosed → awaiting_approval → repairing → ready_for_pickup

Retail delivery:
confirmed → packed → dispatched → delivered
```

### Important design principle

Do not let every business freely create arbitrary statuses initially. Arbitrary workflows can make reporting, payment logic, inventory logic, and integrations unreliable.

Instead provide:

- Platform-defined semantic stages.
- Industry-specific workflow templates.
- Configurable display labels.
- Controlled transitions.
- Optional custom intermediate steps.

## 4.4 Separate inventory item from sellable item

Currently, stock is stored directly on `menu_items`.

That cannot accurately model restaurant ingredients or more complex retail inventory.

Example:

```text
One Veg Burger consumes:
- 1 bun
- 1 patty
- 2 cheese slices
- 20 grams sauce
```

The catalog item is “Veg Burger,” but inventory is maintained for ingredients.

Recommended model:

```text
inventory_items
inventory_locations
inventory_balances
inventory_movements
recipes_or_bills_of_material
recipe_components
stock_counts
purchase_orders
suppliers
```

Use an immutable inventory ledger:

```text
opening_balance   +100
purchase           +50
sale                -2
wastage             -3
adjustment          +1
return               +2
```

The current `stock_logs` concept is a useful starting point, but inventory balance updates and movements must be performed atomically.

## 4.5 Introduce a proper payment domain

Current payment support consists of selecting UPI or cash and manually changing payment status.

A platform needs:

```text
payments
payment_attempts
payment_methods
refunds
payment_webhook_events
settlements
cash_register_sessions
```

Key rules:

- Never mark online payment as paid based on client success.
- Verify payment using a provider webhook.
- Make webhook processing idempotent.
- Support partial and split payments later.
- Store provider references, not sensitive payment data.
- Reconcile order total against captured amount.
- Keep refunds separate from cancellations.

## 4.6 Separate customer identity from tenant relationships

A future customer model can be:

```text
customer_identities
- verified phone/email identity

organization_customers
- relationship between a customer and business
- loyalty status
- preferences
- notes
- marketing consent

customer_addresses
customer_consents
customer_segments
customer_activity
```

Be careful not to make one business's customer data visible to another business. A global identity may exist internally, but each organization's relationship and data must remain isolated.

---

# 5. Platform onboarding design

The onboarding experience is one of the biggest differences between an application and a SaaS platform.

## Recommended onboarding flow

### Step 1: Create an account

- Email/password, magic link, or supported identity provider.
- Verify email.
- Require MFA for administrators later.

### Step 2: Create the business

Collect:

- Business name
- Business type
- Country
- Currency
- Timezone
- Expected size
- Number of locations

### Step 3: Select an industry template

Example:

```text
What best describes your business?

[ Restaurant / Cafe ]
[ Retail Store ]
[ Salon / Spa ]
[ Professional Service ]
[ Repair / Service Center ]
[ Other ]
```

### Step 4: Configure the first location

- Address
- Contact details
- Opening schedule
- Taxes
- Fulfillment methods
- Payment methods

### Step 5: Configure the catalog

Support:

- Manual creation
- CSV import
- Template catalog
- Duplicate from another location
- Bulk image upload
- Guided setup

### Step 6: Invite the team

- Owner
- Administrator
- Location manager
- Cashier
- Fulfillment staff
- Accountant
- Read-only analyst

### Step 7: Select modules

For example:

```text
[x] Customer online ordering
[x] POS
[x] Inventory
[x] QR codes
[ ] Appointments
[ ] Delivery
[ ] Loyalty
```

### Step 8: Guided activation

Provide a launch checklist:

```text
✓ Business profile completed
✓ First location created
✓ Tax configured
✓ Five items added
✓ Staff invited
✓ Payment method configured
✓ Test transaction completed
○ Storefront published
```

### Step 9: Trial and subscription

- Trial start/end date.
- Plan limits.
- Upgrade path.
- Usage visibility.
- Grace period.
- Failed-payment handling.

---

# 6. Multi-tenant authorization model

Implement authorization using explicit membership and permissions.

## Suggested roles

### Organization Owner

- Subscription and billing
- Add/remove locations
- Full reporting
- User administration
- Data export/deletion

### Organization Admin

- Manage most business configuration
- Manage locations and users
- No ownership transfer

### Location Manager

- Manage assigned locations
- Catalog and inventory access
- Operational reports
- Staff administration for assigned locations

### Cashier

- Create transactions
- Record payments
- Restricted refunds
- No configuration access

### Operations Staff

- View and progress assigned fulfillment work
- No revenue or customer-export permissions

### Accountant

- View transactions
- Reconciliation
- Tax reports
- Exports

## Permission model

Use permission codes instead of checking role names in application code:

```text
organization.manage
location.manage
catalog.read
catalog.write
orders.read
orders.create
orders.update_status
orders.cancel
payments.collect
payments.refund
inventory.adjust
customers.read
customers.export
reports.financial.read
users.invite
billing.manage
```

Roles become named collections of permissions, and custom roles can be added later.

Every sensitive mutation should produce an audit record:

```text
actor
organization
location
action
entity_type
entity_id
before
after
IP/device context
timestamp
```

---

# 7. Recommended target architecture

## Near-term architecture

```text
React Applications
├── Customer Storefront
├── Business Admin
├── Staff Operations
└── Platform Administration
          |
     API / Backend-for-Frontend
          |
------------------------------------------------
| Identity | Catalog | Orders | Payments       |
| Customer | Stock   | Promotions | Reporting  |
------------------------------------------------
          |
      PostgreSQL
          |
------------------------------------------------
| Object Storage | Job Queue | Cache | Events  |
------------------------------------------------
```

## Modular-monolith boundaries

A practical module structure:

```text
identity/
tenancy/
authorization/
locations/
catalog/
pricing/
taxation/
customers/
promotions/
orders/
payments/
inventory/
fulfillment/
appointments/
notifications/
reporting/
subscriptions/
audit/
integrations/
```

Each module should own:

- Its service layer.
- Validation.
- Database access.
- Domain policies.
- Event handlers.
- Tests.

Avoid direct database operations scattered across React pages. The current specification notes that individual pages use direct Supabase calls even though React Query is configured.

Move toward:

```text
UI component
    ↓
React Query hook
    ↓
Typed API client
    ↓
Backend command/query
    ↓
Domain service
    ↓
Repository / transaction
```

## Use asynchronous jobs for

- Email/SMS/WhatsApp notifications
- Receipt generation
- Webhook delivery
- Daily reports
- Scheduled opening/closing
- Birthday campaigns
- Stock alerts
- Data exports
- Image optimization
- Search indexing
- Payment reconciliation
- Subscription events

Use an outbox pattern so events are not lost if the application crashes after committing a transaction.

---

# 8. Feature enhancement plan for the existing restaurant product

Before entering new industries, strengthen the restaurant vertical.

## P0 — Security and correctness

1. Transactional server-side order creation.
2. Server-calculated prices, tax, discounts, and total.
3. Atomic stock reservation/deduction.
4. Secure tracking tokens instead of public order selection.
5. OTP or secure customer session.
6. Restrict public customer-profile access.
7. Restrict coupon redemption to a server-side operation.
8. Unique server-generated order numbers.
9. Rate limiting and bot protection.
10. Secure private storage policies.
11. Staff accounts with permissions.
12. Audit logs.
13. Centralized error reporting and monitoring.
14. Automated backups and restore testing.

## P1 — Operational readiness

1. Multiple locations.
2. Per-location schedules and holidays.
3. Per-location catalog availability and pricing.
4. Table management and table-specific QR codes.
5. Dine-in, takeaway, pickup, and delivery fulfillment types.
6. Estimated preparation time.
7. Scheduled/pre-orders.
8. Orders on hold and order editing.
9. Split bills and partial payments.
10. Refunds and voids.
11. Printable receipts and kitchen tickets.
12. Cash register sessions.
13. Taxes, service charges, and inclusive/exclusive pricing.
14. Inventory adjustment approval.
15. Ingredient-level inventory and recipe deductions.
16. Purchase and supplier tracking.

## P2 — Customer growth

1. OTP-based customer accounts.
2. Loyalty points.
3. Customer segments.
4. Campaigns.
5. Birthday automation.
6. Referral codes.
7. Gift cards/store credit.
8. Abandoned-cart recovery.
9. Reorder previous purchase.
10. Saved preferences.
11. Consent-based messaging.
12. Review moderation and response.

## P3 — Platform features

1. Self-service tenant onboarding.
2. Industry-template selection.
3. Subscription plans.
4. Feature entitlements.
5. Usage metering.
6. Multiple themes and custom domains.
7. API keys and webhooks.
8. Import/export tools.
9. Integration marketplace.
10. Platform admin console.
11. Tenant support impersonation with auditing.
12. Localization, multi-currency, and tenant timezones.

---

# 9. Revised implementation roadmap

## Phase 0 — Foundation hardening: 4–6 weeks

### Objective

Make the current product safe and reliable enough for real transactions.

### Deliverables

- Server-side `place_order` transaction
- Secure order tracking
- RLS rewrite
- Staff identities and basic RBAC
- Server-generated order numbers
- Secure coupon redemption
- Inventory concurrency protection
- Scheduled job for shop availability
- Centralized logging
- Error monitoring
- Database backup policy
- Critical integration and security tests

### Exit criteria

- Two simultaneous orders cannot oversell stock.
- A browser cannot manipulate totals.
- A customer cannot access another customer's data.
- A failed order leaves no partial records.
- Every staff mutation is attributable to a user.

---

## Phase 1 — SaaS tenancy: 6–8 weeks

### Objective

Convert one-shop-per-owner into organizations, locations, and memberships.

### Deliverables

- `organizations`
- `locations`
- `organization_members`
- `location_members`
- Roles and permissions
- Invitation flow
- Organization switcher
- Location switcher
- Per-location timezones and schedules
- Organization-level reporting
- Migration from existing `shops`

### Exit criteria

- One organization can run multiple branches.
- One user can belong to more than one organization.
- Users see only authorized locations.
- Existing tenants continue operating after migration.

---

## Phase 2 — Generic commerce core: 8–12 weeks

### Objective

Remove restaurant-specific assumptions from common transaction functionality.

### Deliverables

- Catalog items with product/service types
- Normalized variants and options
- Pricing engine
- Tax engine
- Order/payment/fulfillment status separation
- Payment and refund entities
- Generic fulfillment tasks
- Customer identity/session redesign
- Notification service
- Internal domain events

### Exit criteria

- The same order engine supports a restaurant item and a salon service.
- Industry-specific behavior does not require modifying core schemas repeatedly.
- All monetary calculations remain server-controlled.

---

## Phase 3 — Self-service platform: 6–10 weeks

### Objective

Allow a business to onboard and launch independently.

### Deliverables

- Industry selection
- Guided onboarding
- Setup checklist
- CSV imports
- Trial and subscription
- Plan entitlements
- Usage limits
- Branded storefront
- Custom domain support
- Platform administration console
- Support and tenant diagnostics

### Exit criteria

- A business can sign up, configure the product, complete a test transaction, and launch without database intervention.
- Features and limits are enforced by subscription plan.

---

## Phase 4 — Second industry proof: 8–12 weeks

Select **one adjacent vertical**, not five.

My recommendation is **salon/spa** or **repair/service center**.

### Why salon/spa?

It validates:

- Service catalog
- Duration-based items
- Staff assignment
- Appointment scheduling
- Resource availability
- Packages
- Customer reminders
- Commissions

### Why repair/service center?

It validates:

- Work orders
- Custom workflows
- Parts inventory
- Estimates and approvals
- Technician assignment
- Customer status tracking

If the second vertical can be implemented mostly through modules and configuration, the platform architecture is working. If it requires extensive changes to the commerce core, the abstraction is still too restaurant-specific.

---

# 10. Spec document improvements

Your specification is detailed, but it is primarily an implementation description. For platform growth, split it into several documents.

## 10.1 Product Requirements Document

Include:

- Target customer segments
- Problems being solved
- User personas
- Jobs-to-be-done
- Scope and non-scope
- User journeys
- Success metrics
- Acceptance criteria
- Dependencies

## 10.2 Architecture Decision Records

Document major decisions such as:

- Why organization/location hierarchy was chosen.
- Why a modular monolith is preferred.
- Why order creation must be transactional.
- Why customization moved from JSONB to normalized tables.
- Why customer tracking uses signed tokens.
- How tenant isolation is enforced.

## 10.3 Security and privacy specification

Include:

- Data classification
- RLS/API authorization matrix
- Threat model
- Customer PII handling
- Retention and deletion
- Consent management
- Secrets management
- Audit policies
- Incident-response process

## 10.4 API contract

Define:

- Versioned endpoints
- Request/response schemas
- Authentication
- Authorization
- Idempotency keys
- Error codes
- Pagination
- Rate limits
- Webhooks

## 10.5 Operational specification

Include:

- SLOs and SLIs
- Deployment strategy
- Rollback process
- Backup and recovery
- Monitoring
- Alerting
- Incident runbooks
- Capacity planning

## 10.6 Testing strategy

The current spec describes linting and type checking but does not define a complete automated testing strategy.

Add:

- Unit tests for pricing, tax, and discount rules.
- Database tests for RLS.
- Transaction tests for order placement.
- Concurrency tests for stock.
- Integration tests for payments and webhooks.
- Component tests.
- End-to-end tests for main journeys.
- Accessibility testing.
- Load testing.
- Tenant-isolation penetration tests.

---

# 11. Platform-level non-functional requirements

Define measurable targets.

## Availability

```text
Admin portal:             99.9%
Customer ordering:        99.95%
Order placement API:      99.95%
Payment webhook handling: 99.99%
```

## Performance

```text
Storefront initial usable load:  under 3 seconds on mobile
Catalog API p95:                 under 500 ms
Order placement p95:             under 2 seconds excluding payment
Status update propagation:       under 2 seconds
Admin list API p95:              under 750 ms
```

## Reliability

- Idempotent order submission.
- Idempotent webhook processing.
- Retryable background jobs.
- Dead-letter queue.
- Point-in-time database recovery.
- Regular restore drills.
- No cross-tenant reads in automated security tests.

## Accessibility

Target WCAG 2.2 AA for:

- Keyboard navigation
- Focus management
- Form labels
- Contrast
- Screen readers
- Non-color status indicators
- Reduced-motion support

## Localization

Replace the India-only assumptions with tenant configuration:

- Country-specific phone formats.
- Currency and decimal rules.
- Tax configuration.
- Timezone.
- Locale.
- Date/time format.
- Translated catalog and interface.
- Right-to-left support if international expansion is intended.

---

# 12. Business and pricing model

A platform also requires a commercial model.

## Suggested plan structure

### Starter

- One location
- Limited users
- Catalog
- QR ordering or basic storefront
- Basic reports
- Community/email support

### Growth

- Multiple users
- POS
- Inventory
- Promotions
- Customer CRM
- Advanced reports
- Messaging integrations

### Professional

- Multiple locations
- Advanced roles
- API and webhooks
- Custom domain
- Advanced workflows
- Centralized reporting
- Priority support

### Enterprise

- SSO
- Audit export
- Custom retention
- Dedicated support
- Advanced integrations
- Contractual SLA

Entitlements should be controlled centrally:

```text
catalog.enabled
pos.enabled
inventory.enabled
appointments.enabled
locations.max
users.max
api.enabled
custom_domain.enabled
reports.advanced
```

Do not implement pricing checks through scattered frontend conditions.

---

# 13. Product success metrics

Track metrics from the beginning.

## Acquisition

- Signup conversion rate
- Cost per qualified tenant
- Template selected
- Trial starts

## Activation

- Time to first catalog item
- Time to first staff invitation
- Time to first successful transaction
- Percentage completing launch checklist

## Engagement

- Weekly active businesses
- Transactions per location
- Active staff users
- Module adoption

## Retention

- 30/90/180-day tenant retention
- Revenue churn
- Location expansion
- Transaction-volume growth

## Reliability

- Order failure rate
- Payment mismatch rate
- Overselling incidents
- Notification failure rate
- API p95 latency
- Realtime disconnect rate

## Revenue

- Monthly recurring revenue
- Average revenue per tenant
- Trial-to-paid conversion
- Expansion revenue
- Support cost per tenant

---

# 14. What you should not do

1. **Do not rename restaurant fields and call the system generic.** The underlying workflows also need separation.

2. **Do not build support for ten industries simultaneously.** Stabilize restaurants, establish the platform core, and validate with one second vertical.

3. **Do not move directly to microservices.** A well-structured modular monolith is more appropriate at this stage.

4. **Do not rely on UUID secrecy.** Every request must be authorized.

5. **Do not keep monetary and inventory operations in the browser.**

6. **Do not make everything configurable.** Excessive configurability makes onboarding, support, reporting, and testing extremely difficult.

7. **Do not create a separate codebase for every vertical.** Use a common core with optional modules and templates.

8. **Do not use feature flags as the only subscription system.** You need central entitlements, limits, and auditability.

---

# Final recommendation

Your best path is:

```text
Restaurant Application
        ↓
Secure Multi-Location Restaurant SaaS
        ↓
Generic Commerce and Operations Core
        ↓
Industry Modules
        ↓
Self-Service Multi-Business Platform
```

The immediate priority should not be adding more visible features. It should be fixing the underlying execution and tenancy model:

1. Secure and transactional backend operations.
2. Organization and location hierarchy.
3. Individual staff accounts and RBAC.
4. Generic catalog, pricing, order, payment, and fulfillment domains.
5. Self-service onboarding and subscriptions.
6. One carefully selected second industry.
7. APIs, integrations, and a module ecosystem.

The current application is a credible **vertical SaaS foundation**, but it is not yet a horizontal business platform. The transformation is achievable if you preserve the useful restaurant modules while extracting the reusable capabilities into a secure, configurable platform core.
