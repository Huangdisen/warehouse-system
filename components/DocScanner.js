'use client'
import { useEffect, useRef, useState } from 'react'

// 动态加载 OpenCV.js（jscanify 依赖的全局 cv 对象）
function loadOpenCV() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('非浏览器环境'))
    if (window.cv && window.cv.Mat) return resolve()
    const existing = document.getElementById('opencv-script')
    if (existing) {
      // 已在加载中，等待完成
      const check = setInterval(() => {
        if (window.cv && window.cv.Mat) { clearInterval(check); resolve() }
      }, 100)
      return
    }
    const script = document.createElement('script')
    script.id = 'opencv-script'
    script.src = 'https://docs.opencv.org/4.7.0/opencv.js'
    script.async = true
    script.onload = () => {
      if (window.cv && window.cv.Mat) {
        resolve()
      } else {
        const prev = window.cv?.onRuntimeInitialized
        window.cv = window.cv || {}
        window.cv.onRuntimeInitialized = () => { if (prev) prev(); resolve() }
      }
    }
    script.onerror = () => reject(new Error('OpenCV.js 加载失败'))
    document.head.appendChild(script)
  })
}

// 动态加载 jscanify（依赖 OpenCV.js，仅客户端）
let jscanifyInstance = null

async function getJscanify() {
  if (jscanifyInstance) return jscanifyInstance
  await loadOpenCV()
  const { default: Jscanify } = await import('jscanify/client')
  jscanifyInstance = new Jscanify()
  return jscanifyInstance
}

/**
 * DocScanner — 文档扫描纠偏组件
 *
 * Props:
 *   imageFile: File — 待扫描的图片文件
 *   onConfirm: (blob: Blob) => void — 用户确认后返回纠偏后的图片 Blob
 *   onCancel: () => void — 用户取消
 */
export default function DocScanner({ imageFile, onConfirm, onCancel }) {
  const canvasRef = useRef(null)
  const resultCanvasRef = useRef(null)
  const [step, setStep] = useState('scanning') // 'scanning' | 'result' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!imageFile) return
    runScan()
  }, [imageFile])

  const runScan = async () => {
    try {
      const scanner = await getJscanify()
      const img = new Image()
      const url = URL.createObjectURL(imageFile)
      img.onload = async () => {
        try {
          const canvas = canvasRef.current
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0)

          const resultCanvas = scanner.extractPaper(canvas, img.width, img.height)

          if (!resultCanvas) {
            // 未能识别文档边界，直接显示原图
            const rc = resultCanvasRef.current
            rc.width = canvas.width
            rc.height = canvas.height
            rc.getContext('2d').drawImage(canvas, 0, 0)
            setStep('result')
            return
          }

          const rc = resultCanvasRef.current
          rc.width = resultCanvas.width
          rc.height = resultCanvas.height
          const rctx = rc.getContext('2d')
          rctx.drawImage(resultCanvas, 0, 0)

          setStep('result')
        } catch (e) {
          setStep('error')
          setErrorMsg('扫描失败，请直接上传原图')
        } finally {
          URL.revokeObjectURL(url)
        }
      }
      img.onerror = () => {
        setStep('error')
        setErrorMsg('图片加载失败')
      }
      img.src = url
    } catch (e) {
      setStep('error')
      setErrorMsg('扫描组件加载失败：' + e.message)
    }
  }

  const handleConfirm = () => {
    const rc = resultCanvasRef.current
    rc.toBlob((blob) => onConfirm(blob), 'image/jpeg', 0.85)
  }

  const handleUseOriginal = () => {
    const reader = new FileReader()
    reader.onload = () => {
      const blob = new Blob([reader.result], { type: imageFile.type })
      onConfirm(blob)
    }
    reader.readAsArrayBuffer(imageFile)
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            {step === 'scanning' ? '扫描处理中...' : step === 'result' ? '扫描结果预览' : '扫描出错'}
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="p-4">
          <canvas ref={canvasRef} className="hidden" />

          {step === 'scanning' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-700" />
              <p className="text-sm text-slate-500">正在识别文档边界...</p>
            </div>
          )}

          {step === 'result' && (
            <>
              <canvas ref={resultCanvasRef} className="w-full rounded-xl border border-slate-200 mb-4" />
              <p className="text-xs text-slate-500 mb-4 text-center">如效果不佳，可选择直接使用原图</p>
              <div className="flex gap-3">
                <button
                  onClick={handleUseOriginal}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
                >
                  使用原图
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
                >
                  确认使用
                </button>
              </div>
            </>
          )}

          {step === 'error' && (
            <>
              <p className="text-sm text-red-500 text-center py-4">{errorMsg}</p>
              <canvas ref={resultCanvasRef} className="hidden" />
              <div className="flex gap-3">
                <button
                  onClick={onCancel}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
                >
                  取消
                </button>
                <button
                  onClick={handleUseOriginal}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
                >
                  直接使用原图
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
