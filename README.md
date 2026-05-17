# Visionary Core (ビジョナリー・コア)

> レジェンドの「眼」をインストールするアスリート専用脳トレツール

「フィジカル」を動かす前に、「ビジョン」が正解を導き出していなければならない —
日本サッカー界の二大天才の視覚能力を数値化・体系化し、
ピッチ上の情報を瞬時にマップ化する脳を構築するための Web プロトタイプ。

---

## 開発ステータス

- **Phase 1 ✅ 実装済み** — `Mode: SHUNSUKE` (静的空間マッピング) フル動作
- **Phase 2 ✅ 実装済み** — `Mode: HIDETOSHI` (動的時空間予測) フル動作
- **Phase 3 ✅ 実装済み** — Vision IQ Radar (4軸可視化 + 自己ベスト) /
  周辺視トレーニング (`peripheralReaction`) /
  PLATEAU 連携 (glTF プロバイダ + 自動フォールバック) /
  天候フィルター (晴/霧/雨/逆光、seed 連動)

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

## Mode: HIDETOSHI のフロー (Phase 2 + 4-1)

各クリップは seed で **PLAYER モード** か **SPACE モード** に分岐 (50/50)。
PLAYER は「ターゲット選手の 3 秒後位置」、SPACE は「3 秒後にチームが支配する
最大スペース」を予測する。

| Phase | 説明 |
| --- | --- |
| **CLIP** | 5–9 秒の手続き生成 CG クリップを再生 (4-3-3 vs 4-3-3、ターゲット (or ボールキャリア) は黄色のリングで強調)。 |
| **FREEZE** | パスが出る直前で停止 → 320ms 暗転。 |
| **PREDICT** | 凍結時の選手位置 + 速度ベクトル (薄いライン) が表示。PLAYER は「★ が 3 秒後に到達する地点」、SPACE は「★ が 3 秒後に通せる最大スペース」をタップで回答。RT は `performance.now()` で計測。 |
| **REVEAL** | 3 秒間の前進シミュレーションをアニメで再生。自分の予測点 → 真の到達点 (PLAYER) または 真のスペース (SPACE) を線で結び、誤差を表示。 |

**評価指標**

| 指標 | 計算 |
| --- | --- |
| `Killer Pass` | RT < 500ms かつ 誤差 < 許容距離で成功。許容は PLAYER モードで 3.0m / SPACE モードで 4.0m (スペースは選手より的が大きい) |
| `Reaction Time` | 「PREDICT 画面初描画 → 最初のタップ」を 0.001ms 分解能で計測 |
| `Prediction Speed` | `clamp(100 - reactionMs/15, 0, 100)` |
| `Coord Accuracy`  | `100 · exp(-errorM/6)` |
| `Vision IQ Overall` | `coordAccuracy*0.6 + predictionSpeed*0.4` |

PLAYER の真値は `positionAt(target, freezeAt + 3000)` (等速＋加速の解析解)。
SPACE の真値は `engine/space.ts` の `computeOpenSpace`: キャリア前方 38m × ピッチ幅
を 1m 刻みで探索し、`min(到達敵までの距離)` を最大化するセルを採用 (味方 1 体以上が
3 秒で到達可能な制約付き)。最大味方走速 `8.5 m/s` を仮定し、到達可能半径 25.5m。

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
    scenario.ts            SHUNSUKE 用シナリオ生成 (静的配置) + 天候 seed 選択
    physics.ts             positionAt / velocityAt — 等速＋加速の解析解
    space.ts               computeOpenSpace — HIDETOSHI/SPACE 真値計算
    scoring.ts             SHUNSUKE/HIDETOSHI 両モードのスコアリング
    stadium.ts             StadiumProvider 抽象 + Mock / Plateau 実装
    weather.ts             晴/霧/雨/逆光フィルター (Fog/ライト/雨パーティクル)
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

## 天候フィルター (Phase 3-4)

`engine/weather.ts` で 4 種の難易度フィルターをシーン適用。各 Scenario /
Clip は seeded 乱数で 1 つを決定 (同 seed なら同天候で再現可能)。

| Kind | 視覚 | 効果 |
| --- | --- | --- |
| `clear` (50%) | 通常 | デフォルト Fog 60..240、青系アンビエント |
| `fog` (16%) | 灰青の濃霧 | `THREE.FogExp2(0.022)` で視程 ~50m。遠方は失明、近傍記憶が頼り |
| `rain` (17%) | 暗い背景 + 雨粒 | 600 本の `LineSegments` を縦軸ループ、線形 Fog 40..180、冷色アンビエント |
| `backlight` (17%) | 逆光 | 低角度の暖色 `DirectionalLight` (1.9) + 半球ライト。遠距離はシルエット化 |

選択は `pickWeather(rand)` (`engine/scenario.ts`) で行い、Scenario/Clip 両方
の生成器が呼ぶ。HUD は `clear` 以外で `WEATHER_CHIP` を左上に表示
(`FOG · 濃霧` 等)。`applyWeather` は `WeatherHandle` を返し、`update(dtMs)`
を毎フレーム呼んで雨粒を駆動、`dispose()` でクリーンアップ。

スコアリングへの影響は意図的に **無し** (難易度は seed の運要素として扱う)。
平等な比較が必要なら同 seed で再走するか、`scenario.weather === "clear"` の
ランだけ集計する。

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
- **天候強度のスコアリング考慮**: 同 seed 比較が運用上不便なら、難易度ボーナス
  係数を `score()` / `scoreHidetoshi()` に乗せる。現状は seed 再現性のため
  ニュートラル。
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
- HIDETOSHI/SPACE の真値はグリッドヒューリスティック (1m 刻みの `min(dist to enemy)`)。
  Spearman 2018 等の確率的 pitch-control surface 実装は未対応。
  Voronoi/ピッチコントロールへの差し替えは `engine/space.ts` のみで完結する設計。
- スキャン中のキーボード対応 (WASD) は未実装。
- 周辺視は SHUNSUKE のみ計測 (HIDETOSHI は固定カメラ)。
- 天候はスコアリングに影響しない (難易度補正なし、seed 再現性優先)。
