import { useEffect, useState } from 'react'
import { Package, RefreshCw, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDate } from '@/lib/utils'
import type { MenuItem, StockLog } from '@/types'
import toast from 'react-hot-toast'

type AdjustMode = 'restock' | 'adjustment'

export default function StockPage() {
  const { shop } = useAuth()
  const [tab, setTab] = useState<'stock' | 'log'>('stock')
  const [items, setItems] = useState<MenuItem[]>([])
  const [logs, setLogs] = useState<StockLog[]>([])
  const [loading, setLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(false)
  const [adjustModal, setAdjustModal] = useState<{ item: MenuItem; mode: AdjustMode } | null>(null)
  const [adjustValue, setAdjustValue] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [logPage, setLogPage] = useState(0)
  const LOG_PAGE_SIZE = 20

  useEffect(() => {
    if (shop) fetchItems()
  }, [shop])

  useEffect(() => {
    if (shop && tab === 'log') fetchLogs()
  }, [shop, tab, logPage])

  const fetchItems = async () => {
    if (!shop) return
    setLoading(true)
    const { data } = await supabase
      .from('menu_items')
      .select('*')
      .eq('shop_id', shop.id)
      .not('stock_quantity', 'is', null)
      .order('name')
    setItems((data as MenuItem[]) || [])
    setLoading(false)
  }

  const fetchLogs = async () => {
    if (!shop) return
    setLogsLoading(true)
    const { data } = await supabase
      .from('stock_logs')
      .select('*')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: false })
      .range(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE - 1)
    setLogs((data as StockLog[]) || [])
    setLogsLoading(false)
  }

  const openAdjust = (item: MenuItem, mode: AdjustMode) => {
    setAdjustModal({ item, mode })
    setAdjustValue('')
    setAdjustNote('')
  }

  const applyAdjustment = async () => {
    if (!adjustModal || !shop) return
    const delta = parseInt(adjustValue, 10)
    if (isNaN(delta) || delta === 0) { toast.error('Enter a non-zero quantity'); return }
    const { item, mode } = adjustModal
    const current = item.stock_quantity ?? 0
    const newQty = mode === 'restock' ? current + Math.abs(delta) : current + delta
    if (newQty < 0) { toast.error('Stock cannot go below 0'); return }

    setSaving(true)
    const { error: updateError } = await supabase
      .from('menu_items')
      .update({ stock_quantity: newQty })
      .eq('id', item.id)

    if (updateError) { toast.error(updateError.message); setSaving(false); return }

    const actualDelta = mode === 'restock' ? Math.abs(delta) : delta
    await supabase.from('stock_logs').insert({
      shop_id: shop.id,
      menu_item_id: item.id,
      item_name: item.name,
      delta: actualDelta,
      reason: mode,
      note: adjustNote || null,
    })

    toast.success('Stock updated')
    setSaving(false)
    setAdjustModal(null)
    fetchItems()
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Stock Management</h1>
        <p className="text-gray-500 mt-1 text-sm">Track and update inventory for your menu items.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(['stock', 'log'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'stock' ? 'Current Stock' : 'Movement Log'}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center">
                <Package size={40} className="text-gray-200 mx-auto mb-3" />
                <p className="font-medium text-gray-500">No tracked items</p>
                <p className="text-sm text-gray-400 mt-1">Enable "Track stock" on menu items to see them here.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {items.map((item) => {
                  const isOut = item.stock_quantity === 0
                  const isLow = !isOut && item.stock_quantity !== null && item.stock_quantity <= item.low_stock_threshold
                  return (
                    <div key={item.id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm">{item.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs font-semibold ${isOut ? 'text-red-600' : isLow ? 'text-orange-600' : 'text-green-600'}`}>
                            {isOut ? 'Out of stock' : isLow ? `${item.stock_quantity} left (low)` : `${item.stock_quantity} in stock`}
                          </span>
                          <span className="text-xs text-gray-400">· alert at {item.low_stock_threshold}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openAdjust(item, 'restock')}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                        >
                          <ArrowUp size={12} /> Restock
                        </button>
                        <button
                          onClick={() => openAdjust(item, 'adjustment')}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                        >
                          <Minus size={12} /> Adjust
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'log' && (
        <Card>
          <CardContent className="p-0">
            {logsLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
              </div>
            ) : logs.length === 0 ? (
              <div className="py-16 text-center">
                <RefreshCw size={40} className="text-gray-200 mx-auto mb-3" />
                <p className="font-medium text-gray-500">No movements yet</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-50">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-center gap-4 px-5 py-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${log.delta > 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                        {log.delta > 0 ? <ArrowUp size={14} className="text-green-600" /> : <ArrowDown size={14} className="text-red-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{log.item_name}</p>
                        <p className="text-xs text-gray-400">{log.reason}{log.note ? ` · ${log.note}` : ''}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${log.delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {log.delta > 0 ? `+${log.delta}` : log.delta}
                        </p>
                        <p className="text-xs text-gray-400">{formatDate(log.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center px-5 py-3 border-t border-gray-100">
                  <Button variant="outline" size="sm" disabled={logPage === 0} onClick={() => setLogPage((p) => p - 1)}>← Prev</Button>
                  <span className="text-xs text-gray-400">Page {logPage + 1}</span>
                  <Button variant="outline" size="sm" disabled={logs.length < LOG_PAGE_SIZE} onClick={() => setLogPage((p) => p + 1)}>Next →</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Adjust modal */}
      <Modal
        open={!!adjustModal}
        onClose={() => setAdjustModal(null)}
        title={adjustModal?.mode === 'restock' ? `Restock: ${adjustModal?.item.name}` : `Adjust: ${adjustModal?.item.name}`}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Current stock: <span className="font-semibold text-gray-900">{adjustModal?.item.stock_quantity ?? 0}</span>
          </p>
          <Input
            label={adjustModal?.mode === 'restock' ? 'Quantity to add' : 'Quantity change (use - to reduce)'}
            type="number"
            placeholder={adjustModal?.mode === 'restock' ? 'e.g. 50' : 'e.g. -5 or 10'}
            value={adjustValue}
            onChange={(e) => setAdjustValue(e.target.value)}
          />
          <Input
            label="Note (optional)"
            placeholder="e.g. Morning delivery, spoilage"
            value={adjustNote}
            onChange={(e) => setAdjustNote(e.target.value)}
          />
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setAdjustModal(null)}>Cancel</Button>
            <Button className="flex-1" loading={saving} onClick={applyAdjustment}>Apply</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
