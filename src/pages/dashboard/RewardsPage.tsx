import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface CustomerPoints {
  profile_id: string;
  name: string;
  phone: string;
  balance: number;
  total_earned: number;
  total_redeemed: number;
}

export default function RewardsPage() {
  const { shop } = useAuth()
  const [activeTab, setActiveTab] = useState<'settings' | 'customers'>('settings')
  
  // Program Settings
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form State
  const [isEnabled, setIsEnabled] = useState(false)
  const [earnRate, setEarnRate] = useState('1')
  const [redeemRate, setRedeemRate] = useState('10')
  const [minRedeem, setMinRedeem] = useState('100')
  const [expiryMonths, setExpiryMonths] = useState('')

  // Customers State
  const [customers, setCustomers] = useState<CustomerPoints[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  
  // Adjust Points Modal
  const [adjustModalOpen, setAdjustModalOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerPoints | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  useEffect(() => {
    if (shop) {
      fetchProgram()
      if (activeTab === 'customers') {
        fetchCustomers()
      }
    }
  }, [shop, activeTab])

  const fetchProgram = async () => {
    if (!shop) return
    try {
      const { data, error } = await supabase
        .from('reward_programs')
        .select('*')
        .eq('shop_id', shop.id)
        .maybeSingle()

      if (error) throw error
      
      if (data) {
        setIsEnabled(data.is_enabled)
        setEarnRate(data.earn_rate.toString())
        setRedeemRate(data.redeem_rate.toString())
        setMinRedeem(data.min_redeem_points.toString())
        setExpiryMonths(data.points_expiry_months ? data.points_expiry_months.toString() : '')
      }
    } catch (error: any) {
      toast.error('Failed to load program settings')
    } finally {
      setLoading(false)
    }
  }

  const fetchCustomers = async () => {
    if (!shop) return
    try {
      const { data, error } = await supabase
        .from('reward_points')
        .select(`
          balance, total_earned, total_redeemed,
          customer_profiles (id, name, phone)
        `)
        .eq('shop_id', shop.id)
        .order('total_earned', { ascending: false })
      
      if (error) throw error

      const formatted = (data as any[]).map(d => ({
        profile_id: d.customer_profiles.id,
        name: d.customer_profiles.name,
        phone: d.customer_profiles.phone,
        balance: d.balance,
        total_earned: d.total_earned,
        total_redeemed: d.total_redeemed
      }))
      setCustomers(formatted)
    } catch (err: any) {
      toast.error('Failed to load customers')
    }
  }

  const saveSettings = async () => {
    if (!shop) return
    setSaving(true)
    try {
      const payload = {
        shop_id: shop.id,
        is_enabled: isEnabled,
        earn_rate: parseFloat(earnRate) || 1,
        redeem_rate: parseFloat(redeemRate) || 10,
        min_redeem_points: parseInt(minRedeem) || 100,
        points_expiry_months: expiryMonths ? parseInt(expiryMonths) : null,
        updated_at: new Date().toISOString()
      }
      
      const { error } = await supabase
        .from('reward_programs')
        .upsert(payload, { onConflict: 'shop_id' })

      if (error) throw error
      toast.success('Reward settings saved')
    } catch (err: any) {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleAdjustPoints = async () => {
    if (!shop || !selectedCustomer) return
    const amt = parseInt(adjustAmount)
    if (!amt || isNaN(amt)) {
      toast.error('Enter a valid amount')
      return
    }
    
    setAdjusting(true)
    try {
      const { error } = await supabase.rpc('admin_adjust_points', {
        p_profile_id: selectedCustomer.profile_id,
        p_shop_id: shop.id,
        p_delta: amt,
        p_note: adjustNote || 'Manual adjustment'
      })
      if (error) throw error
      
      toast.success('Points adjusted successfully')
      setAdjustModalOpen(false)
      fetchCustomers() // Refresh list
    } catch (err: any) {
      toast.error('Failed to adjust points')
    } finally {
      setAdjusting(false)
    }
  }

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.phone.includes(searchQuery)
  )

  if (loading) return <div className="p-8">Loading...</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reward Points</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure your loyalty program and manage customer points.</p>
        </div>
      </div>

      <div className="flex gap-4 border-b border-gray-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('settings')}
          className={`pb-3 px-1 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'settings'
              ? 'border-orange-500 text-orange-600 dark:text-orange-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Program Settings
        </button>
        <button
          onClick={() => setActiveTab('customers')}
          className={`pb-3 px-1 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'customers'
              ? 'border-orange-500 text-orange-600 dark:text-orange-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Customer Balances
        </button>
      </div>

      {activeTab === 'settings' ? (
        <Card>
          <CardContent className="p-6 space-y-8">
            <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Enable Rewards Program</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Customers will start earning points on their orders.</p>
              </div>
              <Toggle checked={isEnabled} onChange={setIsEnabled} />
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white border-b border-gray-100 dark:border-slate-800 pb-2">Earning & Redemption Rules</h3>
              
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Earn Rate</label>
                  <p className="text-xs text-gray-500">How many points earned per ₹1 spent?</p>
                  <Input 
                    type="number" 
                    value={earnRate} 
                    onChange={e => setEarnRate(e.target.value)} 
                    placeholder="1"
                  />
                  <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mt-1">Example: For a ₹100 order, earn {100 * (parseFloat(earnRate) || 0)} points.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Redemption Value</label>
                  <p className="text-xs text-gray-500">How many points equal ₹1 discount?</p>
                  <Input 
                    type="number" 
                    value={redeemRate} 
                    onChange={e => setRedeemRate(e.target.value)} 
                    placeholder="10"
                  />
                  <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mt-1">Example: 100 points = ₹{(100 / (parseFloat(redeemRate) || 1)).toFixed(2)} off.</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-6 pt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Minimum points to redeem</label>
                  <Input 
                    type="number" 
                    value={minRedeem} 
                    onChange={e => setMinRedeem(e.target.value)} 
                    placeholder="100"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Points Expiry (Months)</label>
                  <Input 
                    type="number" 
                    value={expiryMonths} 
                    onChange={e => setExpiryMonths(e.target.value)} 
                    placeholder="Leave blank for no expiry"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={saveSettings} disabled={saving}>
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">Leaderboard</h3>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search customers..."
                className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800/50 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3 font-medium">Customer</th>
                  <th className="px-6 py-3 font-medium text-right">Current Balance</th>
                  <th className="px-6 py-3 font-medium text-right">Total Earned</th>
                  <th className="px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">No customers found with points</td>
                  </tr>
                ) : (
                  filteredCustomers.map(c => (
                    <tr key={c.profile_id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900 dark:text-white">{c.name}</p>
                        <p className="text-gray-500">{c.phone}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                          {c.balance} pts
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-gray-500">
                        {c.total_earned} pts
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedCustomer(c);
                            setAdjustAmount('');
                            setAdjustNote('');
                            setAdjustModalOpen(true);
                          }}
                        >
                          Adjust
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {selectedCustomer && (
        <Modal
          open={adjustModalOpen}
          onClose={() => setAdjustModalOpen(false)}
          title={`Adjust points for ${selectedCustomer.name}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Current balance: <strong className="text-gray-900 dark:text-white">{selectedCustomer.balance} pts</strong>
            </p>
            
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Amount (+ or -)</label>
              <Input 
                type="number"
                placeholder="e.g. 50 or -50"
                value={adjustAmount}
                onChange={e => setAdjustAmount(e.target.value)}
              />
              <p className="text-xs text-gray-500">Use negative numbers to deduct points.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Reason Note</label>
              <Input 
                placeholder="e.g. Apology for late order"
                value={adjustNote}
                onChange={e => setAdjustNote(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setAdjustModalOpen(false)}>Cancel</Button>
              <Button onClick={handleAdjustPoints} disabled={adjusting}>
                {adjusting ? 'Saving...' : 'Apply Adjustments'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
