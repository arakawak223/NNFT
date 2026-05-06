# Visionary Core (ビジョナリー・コア)

> レジェンドの「眼」をインストールするアスリート専用脳トレツール

「フィジカル」を動かす前に、「ビジョン」が正解を導き出していなければならない —
日本サッカー界の二大天才の視覚能力を数値化・体系化し、
ピッチ上の情報を瞬時にマップ化する脳を構築するための Web プロトタイプ。

---

## 開発ステータス

- **Phase 1 (MVP) ✅ 実装済み** — `Mode: SHUNSUKE` (静的空間マッピング) フル動作
- **Phase 2 ⏳ 未着手** — `Mode: HIDETOSHI` (動的時空間予測)
- **Phase 3 ⏳ 未着手** — 周辺視トレーニング、天候フィルター、PLATEAU 連携

## クイックスタート

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 静的ビルド (dist/)
```

## Mode: SHUNSUKE のフロー

| Phase | 説明 |
| --- | --- |
| **SCAN** | 1.0 秒間、1 人称視点でピッチを観測。ドラッグ／ジャイロで首振り。 |
| **BLACKOUT** | 画面が暗転。 |
| **PLOT** | 2D 作戦盤に味方 11 / 敵 11 / ボール 1 をドラッグで配置。 |
| **REVEAL** | カメラが地上 → 上空 20m へ上昇するアニメーションで正解と自分の駒を重ね合わせ。 |

**評価指標**

| 指標 | 計算 |
| --- | --- |
| `Viewpoint Altitude` | `200 / 平均誤差(cm)` を 0.1〜20m にクランプ。仕様アンカー: 10cm = 20m, 1m = 2m。 |
| `Coord Accuracy`     | `100 · exp(-平均誤差cm / 280)` |
| `Info Retention`     | `配置数 / 23` |
| `Vision IQ Overall`  | 上記の加重平均 (Phase 1 では 2 軸のみ参加) |

採点は配置とグラウンドトゥルースを kind 別に最近傍貪欲マッチングで対応付け、
誤差の中央値・平均を算出する (11+11+1 規模なので Hungarian は不要)。

## ディレクトリ

```
src/
  data/types.ts            ピッチ寸法・共通型
  engine/
    scenario.ts            乱数シード付きシナリオ生成 (4-3-3 配置 + ボール)
    scoring.ts             誤差→視点高さ→Vision IQ の変換
    stadium.ts             StadiumProvider 抽象 + MockStadium 実装
    orientation.ts         ジャイロ + ドラッグの統一ヨー/ピッチ入力
  modes/shunsuke/
    scan.ts                Three.js 1 人称ビュー
    plot.ts                Canvas 2D 作戦盤
    reveal.ts              地上→俯瞰アニメ + 結果サマリ
    index.ts               フェーズ遷移オーケストレータ
  ui/
    title.ts               タイトル / モード選択
    styles.css
  main.ts                  エントリ
```

## Phase 2 / 3 で差し込む箇所

- **PLATEAU 統合**: `engine/stadium.ts` の `StadiumProvider` を `PlateauStadium`
  実装に差し替え。`MockStadium#build()` のシグネチャに合わせれば `ScanView`
  への変更は不要。
- **天候フィルター**: `MockStadium#build()` の `scene.fog` をシナリオ難易度から
  動的生成。霧 / 雨 / 逆光は `THREE.Fog` + ポストプロセスで対応。
- **HIDETOSHI モード**: `modes/hidetoshi/{video,predict,reveal,index}.ts`
  を新設。実写動画の選手座標をフレーム化したデータセット型を `data/clips.ts`
  に追加し、`engine/scoring.ts` に時空計算 (慣性 + 速度ベクトル) を追加。
- **反応速度計測**: 動画停止 → タップまでを `performance.now()` の 0.001ms
  分解能で記録 (Phase 2)。
- **レーダーチャート可視化**: 4 軸全部が揃う Phase 2 以降に `reveal.ts`
  へ Canvas のレーダーを追加。

## 既知の制限 (Phase 1)

- スタジアムはプレースホルダ (PLATEAU 連携は未実装)。
- レーダーチャート UI は Phase 2 以降。
- ジャイロ較正はセッション開始時の方位を 0 とする簡易版。
- スキャナビゲーションのキーボード対応 (WASD) は未実装。
