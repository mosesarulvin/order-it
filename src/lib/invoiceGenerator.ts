import { formatCurrency, formatDate } from '@/lib/utils'
import type { CustomerOrderSummary } from '@/lib/api/customerOrders'
import type { Order } from '@/types'

export interface InvoiceShopData {
  name: string
  phone?: string | null
  address?: string | null
  tax_percent?: number
  currency?: string
  logo_url?: string | null
}

export interface InvoiceCustomerData {
  name?: string | null
  phone?: string | null
  email?: string | null
}

export interface InvoiceData {
  order_number: string
  created_at: string
  order_type: string
  payment_method: string
  payment_status: string
  status: string
  subtotal: number
  tax_amount: number
  packing_charge: number
  discount_amount: number
  coupon_code?: string | null
  total: number
  notes?: string | null
  items: Array<{
    name: string
    quantity: number
    price?: number
    subtotal: number
    customizations?: any
  }>
}

export function generateInvoiceHTML(
  order: InvoiceData,
  shop: InvoiceShopData,
  customer?: InvoiceCustomerData
): string {
  const formattedDate = order.created_at ? formatDate(order.created_at) : formatDate(new Date().toISOString())
  const isPaid = (order.payment_status || '').toLowerCase() === 'paid' || order.status === 'completed'

  const safeItems = order.items && order.items.length > 0
    ? order.items
    : [{ name: 'Order Items', quantity: 1, price: order.total, subtotal: order.total }]

  const itemsRows = safeItems
    .map((item, idx) => {
      let customText = ''
      if (item.customizations) {
        if (Array.isArray(item.customizations) && item.customizations.length > 0) {
          customText = item.customizations
            .map((c: any) => (typeof c === 'string' ? c : c.choice || c.name || ''))
            .filter(Boolean)
            .join(', ')
        }
      }

      const unitPrice = item.price !== undefined && item.price !== null
        ? item.price
        : (item.quantity > 0 ? (item.subtotal / item.quantity) : item.subtotal)

      return `
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280; text-align: center; font-size: 12px;">${idx + 1}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; font-size: 13px;">
            <div style="font-weight: 700; color: #111827;">${escapeHtml(item.name || 'Item')}</div>
            ${customText ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${escapeHtml(customText)}</div>` : ''}
          </td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; text-align: center; font-size: 13px; font-weight: 700;">${item.quantity || 1}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; text-align: right; font-size: 13px;">${formatCurrency(unitPrice || 0)}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; text-align: right; font-size: 13px; font-weight: 700;">${formatCurrency(item.subtotal || 0)}</td>
        </tr>
      `
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice #${escapeHtml(order.order_number || 'RECEIPT')}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    body {
      background: #f3f4f6;
      color: #111827;
      line-height: 1.45;
      font-size: 13px;
      padding: 24px 16px;
    }
    .action-bar {
      max-width: 720px;
      margin: 0 auto 16px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #1e293b;
      color: #fff;
      padding: 10px 16px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .action-btn {
      background: #3b82f6;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s;
    }
    .action-btn:hover {
      background: #2563eb;
    }
    .close-btn {
      background: transparent;
      color: #94a3b8;
      border: 1px solid #475569;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .close-btn:hover {
      color: #fff;
      border-color: #cbd5e1;
    }
    .invoice-card {
      max-width: 720px;
      margin: 0 auto;
      background: #ffffff;
      padding: 32px 36px;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
      border: 1px solid #e5e7eb;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 20px;
      margin-bottom: 20px;
    }
    .shop-title {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
    }
    .shop-meta {
      color: #475569;
      font-size: 12px;
      margin-top: 5px;
      line-height: 1.4;
      max-width: 340px;
    }
    .invoice-title-block {
      text-align: right;
    }
    .invoice-badge {
      display: inline-block;
      background: #f1f5f9;
      color: #334155;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: 1px solid #e2e8f0;
    }
    .invoice-num {
      font-size: 17px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .grid-info {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 16px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .info-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      margin-bottom: 2px;
    }
    .info-val {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background: #f8fafc;
      color: #475569;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 10px 12px;
      border-top: 1px solid #e2e8f0;
      border-bottom: 2px solid #cbd5e1;
    }
    .totals-wrap {
      display: flex;
      justify-content: flex-end;
      margin-top: 12px;
    }
    .totals-table {
      width: 320px;
      border-collapse: collapse;
    }
    .totals-table td {
      padding: 6px 12px;
      font-size: 13px;
    }
    .totals-table .label {
      color: #475569;
    }
    .totals-table .amount {
      text-align: right;
      font-weight: 600;
      color: #0f172a;
    }
    .totals-table .grand-total {
      border-top: 2px solid #0f172a;
      border-bottom: 2px solid #0f172a;
      padding: 10px 12px;
    }
    .grand-total .label {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
    }
    .grand-total .amount {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
    }
    .stamp {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .stamp-paid {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #86efac;
    }
    .stamp-pending {
      background: #fef3c7;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .footer {
      margin-top: 36px;
      padding-top: 16px;
      border-top: 1px dashed #cbd5e1;
      text-align: center;
      color: #64748b;
      font-size: 11px;
    }
    @media print {
      body {
        background: #fff;
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
      .invoice-card {
        padding: 0;
        border: none;
        box-shadow: none;
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="action-bar no-print">
    <div style="font-size: 12px; color: #cbd5e1;">
      📄 <strong>Tax Invoice Preview</strong> · #${escapeHtml(order.order_number || '')}
    </div>
    <div style="display: flex; gap: 8px; align-items: center;">
      <button class="action-btn" onclick="window.print()">
        🖨️ Print / Save as PDF
      </button>
      <button class="close-btn" onclick="window.close()">✕ Close</button>
    </div>
  </div>

  <div class="invoice-card">
    <div class="header">
      <div>
        <h1 class="shop-title">${escapeHtml(shop.name || 'OrderIt Store')}</h1>
        <div class="shop-meta">
          ${shop.address ? `<div>${escapeHtml(shop.address)}</div>` : ''}
          ${shop.phone ? `<div>Phone: ${escapeHtml(shop.phone)}</div>` : ''}
        </div>
      </div>
      <div class="invoice-title-block">
        <span class="invoice-badge">Tax Invoice</span>
        <div class="invoice-num">#${escapeHtml(order.order_number || 'INV')}</div>
        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${formattedDate}</div>
      </div>
    </div>

    <div class="grid-info">
      <div>
        <div class="info-label">Billed To</div>
        <div class="info-val">${escapeHtml(customer?.name || 'Customer')}</div>
        ${customer?.phone ? `<div style="font-size: 12px; color: #475569; margin-top: 2px;">Phone: +91 ${escapeHtml(customer.phone)}</div>` : ''}
        ${customer?.email ? `<div style="font-size: 12px; color: #475569;">Email: ${escapeHtml(customer.email)}</div>` : ''}
      </div>
      <div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <div class="info-label">Order Type</div>
            <div class="info-val" style="text-transform: capitalize;">${escapeHtml((order.order_type || 'dine_in').replace('_', ' '))}</div>
          </div>
          <div>
            <div class="info-label">Payment Mode</div>
            <div class="info-val" style="text-transform: uppercase;">${escapeHtml(order.payment_method || 'CASH')}</div>
          </div>
          <div>
            <div class="info-label">Payment Status</div>
            <div style="margin-top: 2px;">
              <span class="stamp ${isPaid ? 'stamp-paid' : 'stamp-pending'}">
                ${isPaid ? 'PAID' : escapeHtml(order.payment_status || 'PENDING')}
              </span>
            </div>
          </div>
          <div>
            <div class="info-label">Order Status</div>
            <div class="info-val" style="text-transform: capitalize;">${escapeHtml(order.status || 'Completed')}</div>
          </div>
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 36px; text-align: center;">#</th>
          <th style="text-align: left;">Item Description</th>
          <th style="width: 60px; text-align: center;">Qty</th>
          <th style="width: 95px; text-align: right;">Rate</th>
          <th style="width: 105px; text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <div class="totals-wrap">
      <table class="totals-table">
        <tbody>
          <tr>
            <td class="label">Items Subtotal</td>
            <td class="amount">${formatCurrency(order.subtotal || order.total || 0)}</td>
          </tr>
          ${(order.packing_charge && order.packing_charge > 0) ? `
            <tr>
              <td class="label">Packing / Takeaway Charge</td>
              <td class="amount">${formatCurrency(order.packing_charge)}</td>
            </tr>
          ` : ''}
          ${(order.discount_amount && order.discount_amount > 0) ? `
            <tr>
              <td class="label" style="color: #059669;">
                Discount ${order.coupon_code ? `(${escapeHtml(order.coupon_code)})` : ''}
              </td>
              <td class="amount" style="color: #059669;">- ${formatCurrency(order.discount_amount)}</td>
            </tr>
          ` : ''}
          ${(order.tax_amount && order.tax_amount > 0) ? `
            <tr>
              <td class="label">Taxes &amp; GST</td>
              <td class="amount">${formatCurrency(order.tax_amount)}</td>
            </tr>
          ` : ''}
          <tr class="grand-total">
            <td class="label">Total Amount</td>
            <td class="amount">${formatCurrency(order.total || 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    ${order.notes ? `
      <div style="margin-top: 20px; padding: 10px 14px; background: #f8fafc; border-left: 3px solid #cbd5e1; border-radius: 4px; font-size: 12px; color: #475569;">
        <strong>Special Instructions:</strong> ${escapeHtml(order.notes)}
      </div>
    ` : ''}

    <div class="footer">
      <p style="font-weight: 700; color: #334155; margin-bottom: 3px;">Thank you for dining with us!</p>
      <p>This is a computer-generated tax invoice. No signature required.</p>
    </div>
  </div>

  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        try {
          window.print();
        } catch (e) {
          console.warn('Auto print was blocked', e);
        }
      }, 350);
    });
  </script>
</body>
</html>`
}

export function downloadInvoicePDF(
  order: InvoiceData | Order | CustomerOrderSummary,
  shop: InvoiceShopData,
  customer?: InvoiceCustomerData
) {
  const normalizedOrder: InvoiceData = {
    order_number: order.order_number || 'INV',
    created_at: order.created_at || new Date().toISOString(),
    order_type: (order as any).order_type ?? 'dine_in',
    payment_method: (order as any).payment_method ?? 'cash',
    payment_status: (order as any).payment_status ?? 'paid',
    status: order.status || 'completed',
    subtotal: order.subtotal ?? order.total ?? 0,
    tax_amount: order.tax_amount ?? 0,
    packing_charge: order.packing_charge ?? 0,
    discount_amount: order.discount_amount ?? 0,
    coupon_code: (order as any).coupon_code ?? null,
    total: order.total ?? order.subtotal ?? 0,
    notes: (order as any).notes ?? null,
    items: (order.items && order.items.length > 0)
      ? order.items.map((i: any) => ({
          name: i.name || i.menu_item?.name || 'Item',
          quantity: i.quantity || 1,
          price: i.price ?? (i.subtotal && i.quantity ? i.subtotal / i.quantity : i.price),
          subtotal: i.subtotal ?? ((i.price ?? 0) * (i.quantity ?? 1)),
          customizations: i.customizations,
        }))
      : [],
  }

  const html = generateInvoiceHTML(normalizedOrder, shop, customer)

  // Use Blob URL for consistent browser rendering & styles
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const blobUrl = URL.createObjectURL(blob)

  const printWindow = window.open(blobUrl, '_blank')
  if (!printWindow) {
    // Popup blocked fallback: hidden iframe
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.src = blobUrl
    document.body.appendChild(iframe)

    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
        setTimeout(() => {
          document.body.removeChild(iframe)
          URL.revokeObjectURL(blobUrl)
        }, 5000)
      }, 500)
    }
  }
}

function escapeHtml(str: string): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
