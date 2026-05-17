# Visionary Core (ビジョナリー・コア)

> レジェンドの「眼」をインストールするアスリート専用脳トレツール

「フィジカル」を動かす前に、「ビジョン」が正解を導き出していなければならない —
日本サッカー界の二大天才の視覚能力を数値化・体系化し、
ピッチ上の情報を瞬時にマップ化する脳を構築するための Web プロトタイプ。

---

## 開発ステータス

- **Phase 1 ✅ 実装済み** — `Mode: SHUNSUKE` (静的空間マッピング) フル動作
- **Phase 2 ✅ 実装済み** — `Mode: HIDETOSHI` (動的時空間予測) フル動作
- **Phase 3 🟡 進行中** — `Vision IQ Radar` (4軸可視化 + 自己ベスト追跡) 実装済み。
  残: 周辺視トレーニング、天候フィルター、PLATEAU 連携

## クイックスタート

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 静的ビルド (dist/)
```

## Mode: HIDETOSHI のフロー (Phase 2)

| Phase | 説明 |
| --- | --- |
| **CLIP** | 5–9 秒の手続き生成 CG クリップを再生 (4-3-3 vs 4-3-3、ターゲット選手は黄色のリングで強調)。 |
| **FREEZE** | パスが出る直前で停止 → 320ms 暗転。 |
| **PREDICT** | 凍結時の選手位置 + 速度ベクトル (薄いライン) が表示。「★ ターゲットが 3 秒後に到達する地点」をタップで回答。RT は `performance.now()` で計測。 |
| **REVEAL** | 3 秒間の前進シミュレーションをアニメで再生。自分の予測点 → 真の到達点 を線で結び、誤差を表示。 |

**評価指標**

| 指標 | 計算 |
| --- | --- |
| `Killer Pass` | RT < 500ms かつ 誤差 < 3.0m で成功 (仕様準拠) |
| `Reaction Time` | 「PREDICT 画面初描画 → 最初のタップ」を 0.001ms 分解能で計測 |
| `Prediction Speed` | `clamp(100 - reactionMs/15, 0, 100)` |
| `Coord Accuracy`  | `100 · exp(-errorM/6)` |
| `Vision IQ Overall` | `coordAccuracy*0.6 + predictionSpeed*0.4` |

時空計算は `engine/physics.ts` の `positionAt(state, deltaMs)` で等速＋加速の解析解。
Phase 3 で芝の摩擦・重心移動モデルに差し替え可。

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
  data/
    types.ts               ピッチ寸法・共通型
    clips.ts               HIDETOSHI 用クリップ生成 (速度ベクトル付き)
  engine/
    scenario.ts            SHUNSUKE 用シナリオ生成 (静的配置)
    physics.ts             positionAt / velocityAt — 等速＋加速の解析解
    scoring.ts             SHUNSUKE/HIDETOSHI 両モードのスコアリング
    stadium.ts             StadiumProvider 抽象 + MockStadium 実装
    meshes.ts              共有 Three.js プレイヤー/ボールメッシュ
    orientation.ts         ジャイロ + ドラッグの統一ヨー/ピッチ入力
  modes/shunsuke/
    scan.ts                Three.js 1 人称ビュー
    plot.ts                Canvas 2D 作戦盤
    reveal.ts              地上→俯瞰アニメ + 結果サマリ
    index.ts               フェーズ遷移オーケストレータ
  modes/hidetoshi/
    clip.ts                Three.js 動的シーン再生 (broadcast camera)
    predict.ts             凍結タクティクス盤 + RT 計測
    reveal.ts              3 秒前進シミュレーションアニメ + 結果
    index.ts               フェーズ遷移オーケストレータ
  ui/
    title.ts               タイトル / モード選択
    radar.ts               Vision IQ レーダー + 自己ベスト永続化
    styles.css
  main.ts                  エントリ
```

## Phase 3 で差し込む箇所

- **PLATEAU 統合**: `engine/stadium.ts` の `StadiumProvider` を `PlateauStadium`
  実装に差し替え。`MockStadium#build()` のシグネチャに合わせれば `ScanView` /
  `ClipPlayer` への変更は不要。
- **天候フィルター**: `MockStadium#build()` の `scene.fog` をシナリオ難易度から
  動的生成。霧 / 雨 / 逆光は `THREE.Fog` + ポストプロセスで対応。
- **物理ロジック高度化**: `engine/physics.ts` を芝の摩擦 / 重心移動 / 最大加速度
  上限を含むモデルに差し替え。`positionAt` のシグネチャを保てば呼び出し側無変更。
- **実写動画連携**: `data/clips.ts` の `Clip` を「ベース動画 URL + 各フレームの
  選手 2D 座標 (検出器 or 手動アノテーション由来)」に拡張。`ClipPlayer` を
  `<video>` レンダラに切り替える派生クラスを追加。
- **周辺視トレーニング**: 視野角 75° で見えていた領域外の正解にペナルティ
  係数を掛ける `peripheralReaction` の実装。`AxisValues.peripheralReaction`
  は既にレーダー側で受け口があるので、各モードのスコアラから値を流し込み、
  `index.ts` の `updateBests({ peripheralReaction })` を 1 行追加するだけで
  レーダーが活性化する。

## Vision IQ レーダー (Phase 3)

両モードの REVEAL 画面下部に 4 軸レーダーを表示。

| 軸 | SHUNSUKE | HIDETOSHI | 備考 |
| --- | --- | --- | --- |
| COORD ACCURACY (座標精度) | ✅ | ✅ | 両モードで計測 |
| PREDICTION SPEED (予測速度) | — | ✅ | HIDETOSHI のみ |
| INFO RETENTION (情報保持)   | ✅ | — | SHUNSUKE のみ |
| PERIPHERAL VISION (周辺視)  | — | — | Phase 3 残タスク |

- 未測定の軸は原点に薄いドットで表示 (= 「このモードでは取れない軸」)。
- 自己ベスト (前回までの最高値) は橙色の点線オーバーレイで重畳。
  cross-mode で `vc.bests` に永続化される。
- 100 = レジェンド基準は外周の橙色点線リング。

## 既知の制限 (現バージョン)

- スタジアムはプレースホルダ (PLATEAU 連携は未実装)。
- ジャイロ較正はセッション開始時の方位を 0 とする簡易版。
- HIDETOSHI の予測ターゲットは「選手の 3 秒後位置」のみ (空きスペース予測モード
  は Phase 3 で追加予定)。
- スキャン中のキーボード対応 (WASD) は未実装。
- 周辺視軸は未測定 (レーダー上では原点ドット表示)。
