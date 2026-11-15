# 演示视频方案（初稿，2026-11-14）

目标：2 分钟以内。评委要一眼看到四件事：**真的断网**、**真的在说话**、**表情跟着心情变**、**用了 Bonsai 和 Argmax**。

由你本人录制：macOS 录屏用 Cmd+Shift+5，选“录制所选部分”，麦克风选你的外接或内置麦克风；剪辑用 iMovie。
标 [P1] 的镜头要等 P1 做完才能拍；如果 P1 来不及，就删掉这些镜头，其余照拍。

## 分镜（共约 115 秒）

| 时间 | 画面 | 你做的事 | 讲解词（英文，配音或字幕） |
|---|---|---|---|
| 0:00–0:08 | 标题卡：小伙伴形象 + “Little Buddy — an offline companion that listens” | — | “Your feelings are the most private data you have. What if your companion never sent them anywhere?” |
| 0:08–0:18 | 屏幕右上角的菜单栏 | 点 Wi‑Fi 图标，**关掉 Wi‑Fi**，让画面停 1 秒 | “I'm turning Wi‑Fi off. Everything from here runs on this Mac.” |
| 0:18–0:28 | 浏览器打开 127.0.0.1:4317 | 页面已经就绪（提前预热好） | “Speech is transcribed by Argmax WhisperKit, and replies come from Bonsai 9B, both on-device.” |
| 0:28–0:45 | 按住说话 → “正在转成文字…” → 你的话 → 回复，小伙伴**变开心** | 按住说：**“I just got the internship!”** | “I tell it some good news, and it celebrates with me.” |
| 0:45–1:05 | 小伙伴**变难过**，回复提到前面的实习 | 按住说：**“But I'll have to move away from all my friends, and I feel really lonely about it.”** | “Then something harder. It remembers what I said and stays with me in the sad part.” |
| 1:05–1:20 | [P1] 小伙伴**变焦虑**，邀请你一起深呼吸，呼吸动画 | 按住说：**“I have to give a presentation tomorrow and I'm a bit anxious.”** | “When I'm anxious, it invites me to breathe with it.” |
| 1:20–1:30 | [P1] 回复被念出来（语音回复） | 打开声音，让观众听到 | “It can talk back too, with Argmax text-to-speech, still offline.” |
| 1:30–1:42 | 点右上角“中文”，说一句中文 | 按住说：**“今天考试过了，好开心！”** | “It follows the language you speak: English or Chinese.” |
| 1:42–1:55 | 结尾卡：架构一张图（Mic → WhisperKit → Bonsai 9B → mood → face），写着“Wi‑Fi off · nothing leaves your Mac” | — | “Private by design. Built for the moments you need someone, even with no signal.” |

时间不够时，先删掉 1:30–1:42 的中文段。

## 演示台词（全部在真实后端上测过情绪）

| 台词 | 期望情绪 | 实测 |
|---|---|---|
| I just got the internship! | pleasant-high（开心） | FX-001 3/3 |
| But I'll have to move away from all my friends, and I feel really lonely about it. | unpleasant-low（难过） | FX-002 3/3；改进提示词后接上前文 34/34 |
| I have to give a presentation tomorrow and I'm a bit anxious. | unpleasant-high（焦虑） | FX-004-08 |
| 今天考试过了，好开心！ | pleasant-high | FX-004-01 |

说话要清楚，每句话按住时间在 2 秒以上；等秒数出现、按钮显示“在听”以后再开口。

## 录制前检查清单

1. **联网时**先确认已经跑过 `npm run setup`（只需要一次）。
2. 关掉旧的预览：4317 端口上还有上一轮的预览服务（PID 23757）。在终端按 Ctrl+C，或者用 `kill 23757`。
3. 运行 `npm start`，等终端显示 ready，或者打开页面后“还在醒来”的提示消失。
4. **先完整彩排一遍**：第一句回复会慢一些（缓存还是冷的），彩排之后再正式录。
5. 浏览器里提前允许 127.0.0.1:4317 使用麦克风。录制时不要出现授权弹窗。
6. 打开“勿扰模式”，关掉其他通知；页面切到 EN；浏览器窗口大小固定，比如 1440×900。
7. 房间安静，麦克风离嘴大约 20 cm。
8. **关 Wi‑Fi 这个动作要录进镜头。** 关掉之后，所有对话都在断网状态下完成。
9. 一次没录好也没关系，每个镜头单独录，最后在 iMovie 里拼起来。

## 提交时还需要（不在开发范围内）

- 一句话介绍（草稿）：*An offline voice companion that listens, understands your mood, and never lets your feelings leave your Mac — Bonsai 9B + Argmax WhisperKit, Wi‑Fi off.*
- GitHub 仓库改成公开（需要你决定）；README 写清楚怎么运行。
