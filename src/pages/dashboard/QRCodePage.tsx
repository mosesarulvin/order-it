import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Download, Copy, ExternalLink, QrCode } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'

export default function QRCodePage() {
  const { shop } = useAuth()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')

  const orderUrl = shop ? `${window.location.origin}/order/${shop.slug}` : ''

  useEffect(() => {
    if (!orderUrl) return
    generateQR()
  }, [orderUrl])

  const generateQR = async () => {
    if (!canvasRef.current || !orderUrl) return
    await QRCode.toCanvas(canvasRef.current, orderUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    })
    const url = canvasRef.current.toDataURL('image/png')
    setQrDataUrl(url)
  }

  const downloadQR = () => {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `${shop?.slug}-qr.png`
    a.click()
    toast.success('QR code downloaded!')
  }

  const copyLink = () => {
    navigator.clipboard.writeText(orderUrl)
    toast.success('Link copied to clipboard!')
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">QR Code</h2>
        <p className="text-sm text-gray-500 mt-0.5">Print and place this QR code at your shop counter</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* QR Display card */}
        <Card>
          <CardContent className="p-8 flex flex-col items-center gap-4">
            <div className="p-4 bg-white rounded-2xl shadow-inner border border-gray-100">
              <canvas ref={canvasRef} className="block" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-900">{shop?.name}</p>
              <p className="text-xs text-gray-400 mt-1 break-all">{orderUrl}</p>
            </div>
            <div className="flex gap-2 w-full">
              <Button className="flex-1" onClick={downloadQR}>
                <Download size={15} className="mr-1.5" /> Download
              </Button>
              <Button variant="outline" size="icon" onClick={copyLink} title="Copy link">
                <Copy size={15} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-gray-900 mb-3">How it works</h3>
              <ol className="space-y-3">
                {[
                  { step: '1', text: 'Download and print this QR code' },
                  { step: '2', text: 'Place it on your counter or tables' },
                  { step: '3', text: 'Customers scan and browse your menu' },
                  { step: '4', text: 'They order and choose to pay online (UPI) or at counter' },
                  { step: '5', text: 'You see orders live on your Kitchen dashboard' },
                ].map(({ step, text }) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {step}
                    </span>
                    <span className="text-sm text-gray-600">{text}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Share link</h3>
              <div className="flex gap-2">
                <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-600 truncate border border-gray-100">
                  {orderUrl}
                </div>
                <Button variant="outline" size="sm" onClick={copyLink}>
                  <Copy size={13} className="mr-1.5" /> Copy
                </Button>
              </div>
              <a
                href={orderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 font-medium transition-colors"
              >
                <ExternalLink size={14} /> Preview customer page
              </a>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Print tip */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
        <QrCode size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Printing tip</p>
          <p className="text-sm text-amber-700 mt-0.5">
            Print at minimum 5×5cm for easy scanning. You can also add your shop name and logo around the QR code for a professional look.
          </p>
        </div>
      </div>
    </div>
  )
}
