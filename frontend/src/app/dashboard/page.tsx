export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">マイダッシュボード</h1>
      <p className="text-muted-foreground">あなたの戦績をメタ環境と比較してインサイトを提供します。</p>
      
      <div className="border rounded-xl p-6 bg-card">
        <h2 className="text-xl font-semibold mb-4">メタ・ギャップ分析</h2>
        <div className="h-64 border-dashed border-2 border-muted flex items-center justify-center rounded-lg">
          戦績グラフプレースホルダ
        </div>
      </div>
    </div>
  );
}
