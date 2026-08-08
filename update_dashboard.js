const fs = require('fs');
const file = fs.readFileSync('src/pages/dashboard/DashboardHome.tsx', 'utf8');

let newFile = file.replace(
  "import { TrendingUp, ShoppingBag, Clock, CheckCircle, ArrowRight, UtensilsCrossed, Flame, Package } from 'lucide-react'",
  "import { TrendingUp, ShoppingBag, Clock, CheckCircle, ArrowRight, UtensilsCrossed, Flame, Package, BarChart2, PieChart as PieChartIcon } from 'lucide-react'\nimport { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts'"
);

newFile = newFile.replace(
  "import { useEffect, useRef, useState } from 'react'",
  "import { useEffect, useRef, useState, useMemo } from 'react'"
);

newFile = newFile.replace(
  "const [recentOrders, setRecentOrders] = useState<Order[]>([])",
  "const [recentOrders, setRecentOrders] = useState<Order[]>([])\n  const [allOrders, setAllOrders] = useState<Order[]>([])"
);

newFile = newFile.replace(
  ".limit(5)",
  ".gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())\n        .order('created_at', { ascending: false })"
);

newFile = newFile.replace(
  "setRecentOrders((ordersRes.data as Order[]) || [])",
  "const fetchedOrders = (ordersRes.data as Order[]) || []\n    setAllOrders(fetchedOrders)\n    setRecentOrders(fetchedOrders.slice(0, 5))"
);

const chartDataLogic = `
  const chartData = useMemo(() => {
    if (!allOrders.length) return null

    // 1. Daily Revenue (last 7 days)
    const days = [...Array(7)].map((_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    })

    const dailyRevenueMap = new Map(days.map(d => [d, 0]))
    allOrders.forEach(o => {
      if (o.status !== 'cancelled') {
        const dateStr = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        if (dailyRevenueMap.has(dateStr)) {
          dailyRevenueMap.set(dateStr, (dailyRevenueMap.get(dateStr) || 0) + o.total)
        }
      }
    })
    const revenueTrend = days.map(day => ({ name: day, revenue: dailyRevenueMap.get(day) }))

    // 2. Top Selling Items
    const itemCounts = new Map<string, number>()
    let itemsSoldToday = 0
    const todayStr = new Date().toDateString()
    
    allOrders.forEach(o => {
      if (o.status !== 'cancelled') {
        const isToday = new Date(o.created_at).toDateString() === todayStr
        o.items?.forEach(item => {
          itemCounts.set(item.name, (itemCounts.get(item.name) || 0) + item.quantity)
          if (isToday) itemsSoldToday += item.quantity
        })
      }
    })
    
    const topItems = Array.from(itemCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name: name.length > 15 ? name.substring(0, 15) + '...' : name, sales: count }))

    // 3. Order Sources
    let walkin = 0, qr = 0
    allOrders.forEach(o => {
      if (o.status !== 'cancelled') {
        if (o.order_source === 'walkin') walkin++
        else qr++
      }
    })
    const orderSources = [
      { name: 'Walk-in', value: walkin },
      { name: 'QR Code', value: qr }
    ].filter(s => s.value > 0)

    // 4. Payment Methods
    let cash = 0, upi = 0
    allOrders.forEach(o => {
      if (o.status !== 'cancelled') {
        if (o.payment_method === 'cash') cash++
        else if (o.payment_method === 'upi') upi++
      }
    })
    const paymentMethods = [
      { name: 'Cash', value: cash },
      { name: 'UPI', value: upi }
    ].filter(p => p.value > 0)

    // 5. AOV
    const validOrders = allOrders.filter(o => o.status !== 'cancelled')
    const totalRev = validOrders.reduce((sum, o) => sum + o.total, 0)
    const aov = validOrders.length ? (totalRev / validOrders.length) : 0

    return { revenueTrend, topItems, orderSources, paymentMethods, itemsSoldToday, aov }
  }, [allOrders])

  const statCards`;

newFile = newFile.replace("const statCards", chartDataLogic);

const statCardsReplacement = `const statCards = [
    {
      label: "Today's Revenue",
      value: formatCurrency(stats?.today_revenue || 0),
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-900/30',
      sub: 'Paid orders today',
    },
    {
      label: 'Active Orders',
      value: stats?.pending_orders || 0,
      icon: Clock,
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-900/30',
      sub: 'Pending / preparing',
    },
    {
      label: 'Items Sold',
      value: chartData?.itemsSoldToday || 0,
      icon: Package,
      color: 'text-pink-600 dark:text-pink-400',
      bg: 'bg-pink-50 dark:bg-pink-900/30',
      sub: 'Today',
    },
    {
      label: 'Avg Order Value',
      value: chartData ? formatCurrency(chartData.aov) : formatCurrency(0),
      icon: BarChart2,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-900/30',
      sub: 'Last 7 days',
    },
    {
      label: 'Total Orders',
      value: stats?.total_orders || 0,
      icon: ShoppingBag,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/30',
      sub: 'All time',
    },
    {
      label: 'Total Revenue',
      value: formatCurrency(stats?.total_revenue || 0),
      icon: CheckCircle,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-900/30',
      sub: 'Last 90 days',
    },
  ]`;

newFile = newFile.replace(/const statCards = \[[\s\S]*?\]/, statCardsReplacement);

newFile = newFile.replace('grid-cols-2 lg:grid-cols-4', 'grid-cols-2 md:grid-cols-3');

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];

const chartsSection = `
      {/* Business Insights (Charts) */}
      {!loading && chartData && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <PieChartIcon size={20} className="text-orange-500" />
            Business Insights
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* Revenue Trend */}
            <Card>
              <CardContent className="p-5">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Revenue (Last 7 Days)</h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData.revenueTrend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                      <YAxis tickFormatter={(val) => '₹' + val} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                      <RechartsTooltip 
                        formatter={(value) => [formatCurrency(Number(value)), 'Revenue']}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={3} dot={{ r: 4, fill: '#f97316' }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Top Selling Items */}
            <Card>
              <CardContent className="p-5">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Top 5 Items (Last 7 Days)</h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData.topItems} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} horizontal={true} vertical={false} />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                      <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#4b5563', fontWeight: 500 }} width={100} />
                      <RechartsTooltip 
                        formatter={(value) => [value, 'Sales']}
                        cursor={{fill: 'transparent'}}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="sales" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Orders Source & Payments */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-1 lg:col-span-2">
              <Card>
                <CardContent className="p-5">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Order Sources</h4>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={chartData.orderSources} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                          {chartData.orderSources.map((entry, index) => (
                            <Cell key={\`cell-\${index}\`} fill={['#f97316', '#8b5cf6'][index % 2]} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(value) => [value, 'Orders']} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Payment Methods</h4>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={chartData.paymentMethods} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                          {chartData.paymentMethods.map((entry, index) => (
                            <Cell key={\`cell-\${index}\`} fill={['#10b981', '#3b82f6'][index % 2]} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(value) => [value, 'Orders']} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
            
          </div>
        </div>
      )}

      {/* Low stock alert */}
`;

newFile = newFile.replace("{/* Low stock alert */}", chartsSection);

fs.writeFileSync('src/pages/dashboard/DashboardHome.tsx', newFile);
