#!/bin/bash

# ==============================================================================
# ブロラボ (Brawl Lab) - Meta Data Crawler Cron Setup
# ==============================================================================
# このスクリプトはLinuxサーバー等のcronジョブとして設定する内容を定義しています。
# Windows環境の場合はタスクスケジューラ等で同等の設定を行ってください。

# プロジェクトのルートディレクトリをフルパスで指定してください。
PROJECT_ROOT="/path/to/brawl-analytics"
PYTHON_BIN="/usr/bin/python3" # 環境に合わせて変更してください

echo "Cronジョブを設定するには、以下の内容を \`crontab -e\` に追加してください。"
echo ""
echo "# ==========================================================="
echo "# ブロラボ Crawler"
echo "# ==========================================================="
echo ""
echo "# 1. 通常の差分クローリング (2時間に1回実行し、データを蓄積する)"
echo "0 */2 * * * cd $PROJECT_ROOT && $PYTHON_BIN backend/scripts/update_meta.py >> backend/logs/cron.log 2>&1"
echo ""
echo "# 2. 定期リセット (毎月1日の深夜0時に蓄積データをリセットしてゼロから収集する)"
echo "0 0 1 * * cd $PROJECT_ROOT && $PYTHON_BIN backend/scripts/update_meta.py --reset >> backend/logs/cron.log 2>&1"
echo ""
echo "設定後は \`crontab -l\` で確認できます。"
