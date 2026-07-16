export default function TierListPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">環境分析 (Tier表)</h1>
      <p className="text-muted-foreground">最新の勝率データに基づいた全キャラクターのTier表と相性データです。</p>
      
      <div className="border rounded-xl p-6 bg-card">
        <h2 className="text-xl font-semibold mb-4">総合Tierランキング</h2>
        <div className="h-64 border-dashed border-2 border-muted flex items-center justify-center rounded-lg">
          Tier表プレースホルダ
        </div>
      </div>
    </div>
  );
}
