# NEON DODGE · 霓虹躲避

一个零依赖的霓虹风躲避小游戏：在坠落的光柱之间穿行，**擦身而过**会累积连击、分数涨得更快；拾取道具还能护盾、减速、双倍。

键盘、鼠标、触屏都能玩；没有构建步骤，没有第三方库，一个 HTML 文件就能跑起来。

<p>
  <a href="https://github.com/cv-malin/neon-dodge"><img src="https://img.shields.io/badge/version-1.1.0-38bdf8?style=flat-square&labelColor=0d1117" alt="version" /></a>
  <img src="https://img.shields.io/badge/dependencies-0-7ee787?style=flat-square&labelColor=0d1117" alt="dependencies" />
  <img src="https://img.shields.io/badge/tests-26%20passed-7ee787?style=flat-square&labelColor=0d1117" alt="tests" />
  <a href="https://cv-malin.github.io/neon-dodge/"><img src="https://img.shields.io/badge/play-online-a78bfa?style=flat-square&labelColor=0d1117&logo=githubpages&logoColor=white" alt="play online" /></a>
</p>

![游戏画面](docs/preview.png)

## 在线试玩

**https://cv-malin.github.io/neon-dodge/**

手机上直接打开也能玩，建议横屏。

## 特性

- **手感**：角色跟随有阻尼，不是生硬的位置赋值；障碍下落速度与刷新频率随距离平滑上升。
- **擦身机制**：贴着障碍边缘擦过去会触发连击，最高 ×9，奖励分数并震动一下镜头。风险越大，收益越高。
- **道具系统**：护盾、减速、双倍三种道具，8~14 秒随机刷新一只，拾取有音效、粒子与触感反馈。
- **本地排行榜**：保留最近 8 条成绩，同分先到先得；破纪录会在榜单里高亮。
- **移动端触感**：撞击、擦身、拾取都会触发不同强度的震动（Vibration API，iOS 自动降级）。
- **三种障碍**：单柱、带缺口的双柱（保证永远留出 4.2 倍身位的通道）、横向摆动的移动柱。
- **零依赖**：原生 ES Module + Canvas 2D，没有打包器、没有框架、没有 CDN 资源。
- **自适应**：任意窗口尺寸、devicePixelRatio 缩放、`prefers-reduced-motion` 降级。
- **可复现**：`?seed=42` 固定随机序列，`?auto=1` 进入自动驾驶演示模式。
- **有测试**：碰撞、擦身、难度曲线、障碍生成、道具计时、排行榜排序共 26 个单元测试。
- **可访问**：键盘可完整操作，`aria-live` 播报分数与状态，音效可关闭。

## 操作

| 输入 | 行为 |
| :--- | :--- |
| `←` `→` / `A` `D` | 左右移动 |
| 鼠标移动 | 角色跟随光标 |
| 触屏拖动 | 手指按住拖动 |
| `空格` / `Enter` | 开始 / 重新开始 |
| `P` / `Esc` | 暂停 / 继续（排行榜界面返回菜单） |
| `M` | 静音切换 |

## 道具

| 道具 | 效果 | 时长 |
| :--- | :--- | :--- |
| 🛡 护盾 | 抵挡一次撞击，破碎后获得 1.2 秒无敌（角色闪烁） | 消耗品 |
| ⏳ 减速 | 障碍与场景流速降到 0.55 倍 | 5 秒 |
| ×2 双倍 | 得分翻倍（含擦身奖励） | 6 秒 |

同类道具**刷新时长而不是叠加**——否则连续吃三个减速就能把游戏永久慢放。护盾可以叠在任意效果之上。

![排行榜](docs/scores.png)

## 本地运行

```bash
git clone https://github.com/cv-malin/neon-dodge.git
cd neon-dodge

# 方式一：内置零依赖静态服务器
node scripts/serve.mjs          # → http://localhost:5173

# 方式二：任意静态服务器，例如
python -m http.server 5173
```

> 不能直接双击 `index.html`：ES Module 在 `file://` 下会被 CORS 拦截。

## 测试

```bash
node --test
```

```
ℹ tests 26
ℹ pass 26
ℹ fail 0
```

覆盖范围：

| 模块 | 断言重点 |
| :--- | :--- |
| `logic.js` | 圆矩碰撞、擦身净距、难度单调、`gate` 缺口 ≥ 4.2r（300 个种子）、自动驾驶落点 |
| `powerups.js` | 道具刷新不叠加、计时器到期、时间尺度、分数倍率、权重抽取 |
| `leaderboard.js` | 降序、同分先到先得、上限截断、脏数据过滤 |

## 项目结构

```
neon-dodge/
├── index.html            # 页面骨架 + HUD + 浮层（含排行榜）
├── style.css             # 霓虹主题、道具状态条、榜单样式
├── src/
│   ├── main.js           # 启动、主循环（固定步长）、界面状态机
│   ├── game.js           # 玩法与渲染（含道具与护盾结算）
│   ├── logic.js          # 纯逻辑：碰撞、难度、生成、自动驾驶
│   ├── powerups.js       # 道具定义、效果计时、刷新节奏
│   ├── leaderboard.js    # 榜单排序与截断
│   ├── entities.js       # 障碍与粒子
│   ├── input.js          # 键盘 / 鼠标 / 触屏
│   ├── audio.js          # WebAudio 合成音效（无音频文件）
│   ├── haptics.js        # Vibration API 封装
│   ├── rng.js            # 可复现随机数
│   └── storage.js        # 最高分与榜单持久化
├── tests/                # node:test 单元测试（3 个文件 / 26 项）
├── scripts/serve.mjs     # 零依赖静态服务器
└── .github/workflows/pages.yml
```

## 设计笔记

**固定步长。** 物理更新用 1/120 秒的固定步长累加，渲染跟随 `requestAnimationFrame`。这样 144Hz 和 60Hz 屏幕上手感一致，掉帧时也不会出现「穿模」。

**难度是连续的。** 速度从 0.55 屏/秒爬到 1.4 屏/秒，刷新间隔从 0.95 秒压到 0.4 秒，150 屏后封顶。曲线在 `difficultyAt()` 里，是纯函数，可以单测，也可以直接调参。

**公平性优先。** `gate` 形态的缺口由玩家半径推导（≥ 4.2r），不是拍脑袋的像素值；屏幕太窄时会退化成单柱，绝不出零宽障碍。

**擦身判定。** 只在障碍与玩家垂直方向有交叠时计算水平净距，净距 ≤ 2.4r 记为擦身。每个障碍只结算一次，避免「贴着走一路刷分」。

**道具刷新而非叠加。** 同类效果取完整时长，避免叠加出无限减速；护盾是布尔量，与计时类效果互不干扰。

**触感分级。** 撞击是 `45/30/90ms` 的三段震动，擦身是 12ms 的轻点，拾取是 18ms。iOS Safari 不支持 Vibration API，调用处做了存在性判断，静默降级。

**音效全部合成。** 没有 mp3/ogg 资源，振荡器 + 包络就够了，加载为零、体积为零。

## 部署

仓库自带 GitHub Pages 工作流，推送到 `main` 即自动发布：

```yaml
- actions/configure-pages
- actions/upload-pages-artifact   # 只打包静态文件
- actions/deploy-pages
```

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

## 路线图

- [ ] 道具磁吸与「风险偏好」难度选项
- [ ] 用 OffscreenCanvas + Worker 把渲染挪出主线程
- [ ] Gamepad 支持

## 许可

[MIT](LICENSE) © 2026 cv-malin
