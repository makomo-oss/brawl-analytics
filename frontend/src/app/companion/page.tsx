export default function CompanionPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">リアルタイムBAN/Pick支援</h1>
      <p className="text-muted-foreground">マップと味方・敵のピック状況に応じた最適解を提案します。</p>
      
      {/* 今後実装するUIコンポーネント用のプレースホルダ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border rounded-xl p-6 bg-card">
          <h2 className="text-xl font-semibold mb-4">設定・状況入力</h2>
          <div className="h-48 border-dashed border-2 border-muted flex items-center justify-center rounded-lg">
            入力フォームプレースホルダ
          </div>
        </div>
        <div className="border rounded-xl p-6 bg-card border-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.15)]">
          <h2 className="text-xl font-semibold mb-4 text-primary">おすすめキャラクター</h2>
          <div className="h-48 flex items-center justify-center">
            推薦結果プレースホルダ
          </div>
        </div>
      </div>
    </div>
  );
}
