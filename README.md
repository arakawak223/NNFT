# Visionary Core (ビジョナリー・コア)

> レジェンドの「眼」をインストールするアスリート専用脳トレツール

「フィジカル」を動かす前に、「ビジョン」が正解を導き出していなければならない —
日本サッカー界の二大天才の視覚能力を数値化・体系化し、
ピッチ上の情報を瞬時にマップ化する脳を構築するための Web プロトタイプ。

---

## 開発ステータス

- **Phase 1 ✅ 実装済み** — `Mode: SHUNSUKE` (静的空間マッピング) フル動作
- **Phase 2 ✅ 実装済み** — `Mode: HIDETOSHI` (動的時空間予測) フル動作
- **Phase 3 🟡 進行中** — Vision IQ Radar (4軸可視化 + 自己ベスト) ✅ /
  周辺視トレーニング (`peripheralReaction`) ✅ /
  PLATEAU 連携 (glTF プロバイダ + 自動フォールバック) ✅。
  残: 天候フィルター

## クイックスタート

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 静的ビルド (dist/)
```

PLATEAU 連携を有効にするには `.env.local` (gitignore 済) または環境変数で
glTF/glb の URL を渡す:

```bash
VITE_PLATEAU_GLTF_URL=https://example.com/path/to/stadium.glb npm run dev
```

未設定でも動作する (タイトル画面の PLATEAU トグルが disabled 化、MOCK のみ
利用可)。設定済みかつ読み込み失敗時は自動で MOCK スタジアムにフォールバック
し、トースト通知する。

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
| `Peripheral Vision`  | SCAN 時の yaw 履歴から 視野外プール (offset > 37.5°) を抽出し `100 · exp(-平均誤差m / 4)`。プール < 3 体なら null。 |
| `Vision IQ Overall`  | 周辺視ありなら `0.55·座標 + 0.20·保持 + 0.25·周辺視`、なしなら `0.7·座標 + 0.3·保持`。 |

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
    title.ts               タイトル / モード選択 + STADIUM トグル
    radar.ts               Vision IQ レーダー + 自己ベスト永続化
    styles.css
  main.ts                  エントリ / PLATEAU URL 読込 / トースト
```

## PLATEAU 連携 (Phase 3-3)

`engine/stadium.ts` に `PlateauStadium implements StadiumProvider` を追加。

| 役割 | 実装 |
| --- | --- |
| 共通ベース (芝・ライン・照明) | `buildBasePitch()` を MOCK/PLATEAU で共有 |
| 観客席 (MOCK) | 4 枚の長方形の `MeshStandardMaterial` 壁 |
| 観客席 (PLATEAU) | `GLTFLoader().loadAsync(url)` → `normalizeStadiumTransform()` で中心 + 接地 |
| フォールバック | 読み込み失敗時に `buildMockTribune()` を append、トースト表示 |
| 選択 UI | タイトル画面の `STADIUM: MOCK / PLATEAU` セグメントトグル |
| 永続化 | `localStorage['vc.stadium']` |
| URL 設定 | `VITE_PLATEAU_GLTF_URL` (Vite 環境変数) |

**ピッチは常に手続き生成** なので、PLATEAU 側の座標系 (EPSG:6697 等) に
合わせ込む必要はない。スタジアム構造体は装飾として中心 0,0 / 接地 Y=0 に
正規化される。

データソース候補:
- [Project PLATEAU GitHub Releases](https://github.com/Project-PLATEAU) の
  シティモデル glTF エクスポート
- [PLATEAU VIEW](https://plateauview.mlit.go.jp/) からエクスポートした 3D Tiles
  を glTF/glb に変換 (本格 3D Tiles ストリーミングは Phase 3+ で
  `3d-tiles-renderer` を検討)

## Phase 3 で差し込む箇所
- **天候フィルター**: `MockStadium#build()` の `scene.fog` をシナリオ難易度から
  動的生成。霧 / 雨 / 逆光は `THREE.Fog` + ポストプロセスで対応。
- **物理ロジック高度化**: `engine/physics.ts` を芝の摩擦 / 重心移動 / 最大加速度
  上限を含むモデルに差し替え。`positionAt` のシグネチャを保てば呼び出し側無変更。
- **実写動画連携**: `data/clips.ts` の `Clip` を「ベース動画 URL + 各フレームの
  選手 2D 座標 (検出器 or 手動アノテーション由来)」に拡張。`ClipPlayer` を
  `<video>` レンダラに切り替える派生クラスを追加。
- **周辺視可視化の強化**: `ScoreReport.peripheral.offsetsDeg` を REVEAL の
  俯瞰盤に重ねて、視野外エンティティだけ別色で強調する (現在は数値のみ)。

## Vision IQ レーダー (Phase 3)

両モードの REVEAL 画面下部に 4 軸レーダーを表示。

| 軸 | SHUNSUKE | HIDETOSHI | 備考 |
| --- | --- | --- | --- |
| COORD ACCURACY (座標精度) | ✅ | ✅ | 両モードで計測 |
| PREDICTION SPEED (予測速度) | — | ✅ | HIDETOSHI のみ |
| INFO RETENTION (情報保持)   | ✅ | — | SHUNSUKE のみ |
| PERIPHERAL VISION (周辺視)  | ✅ | — | SHUNSUKE のみ (固定カメラの HIDETOSHI では計測不能) |

## 周辺視メトリクス (Phase 3-2)

SHUNSUKE の SCAN 中、毎フレーム `OrientationController.state.yaw` を
サンプリング (~60 サンプル / 1 秒)。REVEAL 時に `engine/scoring.ts` の
`computePeripheralBreakdown` が各 truth エンティティについて

```
bearing = atan2(-(e.z - obs.z), e.x - obs.x)
minOffset = min_t |angleDiff(yaw_t, bearing)|
```

を算出し、`minOffset > FOV/2` (FOV = 75°) のエンティティを **「視野外プール」**
と定義する (= 一度も画面中央付近に入らなかった)。

```
peripheralReaction = round(100 · exp(-avg_error_m / 4))
```

- プール ≥ 3 体のとき有効。未満なら `null` (= 周辺視テスト未成立)。
  「全方向を見回した」ランは null になり、レーダーでは原点表示。
- プールが多いほどテストとしては厳密。**「一点凝視 → 周りを記憶」** が高得点。
- Overall IQ は周辺視を含むときは `0.55·座標 + 0.20·保持 + 0.25·周辺視` に
  リウェイト (なしのときは従来通り `0.7·座標 + 0.3·保持`)。

`ScoreReport.peripheral` に `PeripheralBreakdown` (各エンティティの
`offsetDeg` / `errorM`) が乗るので、Phase 3+ で「視野外マーカーを色分け表示」
する拡張が容易。

- 未測定の軸は原点に薄いドットで表示 (= 「このモードでは取れない軸」)。
- 自己ベスト (前回までの最高値) は橙色の点線オーバーレイで重畳。
  cross-mode で `vc.bests` に永続化される。
- 100 = レジェンド基準は外周の橙色点線リング。

## 既知の制限 (現バージョン)

- PLATEAU 統合は glTF/glb 単発ロードのみ (本格 3D Tiles ストリーミング・LOD・
  座標系変換は未実装)。
- ジャイロ較正はセッション開始時の方位を 0 とする簡易版。
- HIDETOSHI の予測ターゲットは「選手の 3 秒後位置」のみ (空きスペース予測モード
  は Phase 3 で追加予定)。
- スキャン中のキーボード対応 (WASD) は未実装。
- 周辺視は SHUNSUKE のみ計測 (HIDETOSHI は固定カメラ)。
