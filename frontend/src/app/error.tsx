"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RotateCcw } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Application runtime error:", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[50dvh] text-center p-6 space-y-6">
      <div className="p-4 rounded-full bg-destructive/10 text-destructive border border-destructive/20 shadow-lg">
        <AlertTriangle className="w-12 h-12" />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-black tracking-tight">予期せぬエラーが発生しました</h2>
        <p className="text-sm text-muted-foreground">
          表示の処理中に問題が発生しました。再読み込みまたは下のボタンから再試行してください。
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => reset()} className="min-h-11 shadow-md">
          <RotateCcw className="w-4 h-4 mr-2" />
          再試行
        </Button>
        <Button variant="outline" onClick={() => window.location.reload()} className="min-h-11">
          ページを再読み込み
        </Button>
      </div>
    </div>
  )
}
