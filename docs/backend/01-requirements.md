# Requirements — 离线小伙伴：真实语音转文字、Bonsai 回复与情绪，支持英文

- Author: be-analyst #1 · Status: draft · 2026-11-14
- Sources: `docs/backend/state.json` goal; `docs/backend/deferred.md` 顶段 cut line；`contracts/FRONTEND_BACKEND_CONTRACT.md` §1 C-001..C-005、§2 "Seam for run companion-full-dev"、§3 O-1..O-4；`idea.md` § 情绪模型、§ 范围、§ 性格设定；`docs/frontend/00-requirements.md`（原型已满足的 REQ，不重写）；`docs/frontend/deferred.md` D-001..D-003。
- 已建成（不重述）：原型页面 `web/` 的打字发送、按住说话录音提示、5 种情绪表情、多轮记录、减少动态、离线加载（前端 REQ-001..REQ-008）；数据全部来自假数据层 `web/js/companion-client.js:1-4`，无后端服务（`package.json:7` 只起静态服务器）。

## 0. Understanding
- **Asked:** "断网时语音 → Bonsai 真实回复 + 情绪判断 → 小伙伴表情变化，支持英文。回复跟随用户说的语言（中/英），界面文字加中/英切换。"
- **Check:** "关掉 Wi-Fi，npm start 打开页面，按住说一句开心的英文……几秒内出现 Bonsai 现场生成的英文回复（不是预设句），小伙伴变开心；再说一句难过的，回复接得上前文，小伙伴变难过。"
- **Means:** 断网下 `npm start` 后，按住说的中/英文被真实转写，Bonsai 2 现场生成同语言回复和该句情绪，小伙伴随之变化；多轮接得上；后端慢或没起时页面有交代；界面可切中/英。
- **Ambiguities:** "几秒内" — assumed: 松开到回复 ≤ 10 s（A1）· 安全兜底（988）本轮做不做 — blocking（改变要建的东西），assumed: 不做（REQ-013 below）· 其余见 §3 A2–A15。

## 1. Requirements
情绪 id（契约 §2）：`pleasant-high` 开心/兴奋 · `pleasant-low` 平静/满足 · `unpleasant-high` 焦虑/生气 · `unpleasant-low` 难过/疲惫 · `neutral`。

### REQ-001 — 语音被真实转写 [interface]
- **Cut:** above
- **Behaviour:** 松开后，这段话（1–60 s）的真实文字成为用户这一轮。
- **Accept:** Given 预热完成，When 转写 FX-005..FX-007，Then 英文 WER、中文 CER 均 ≤ 15%（忽略标点和大小写）。
- **Source:** "按住说一句开心的英文"；contract §1 C-001
- **Fixtures:** FX-005, FX-006, FX-007

### REQ-002 — 转写保持说话的语言 [interface]
- **Cut:** above
- **Behaviour:** 说中文得简体汉字，说英文得英文；不翻译，不出现第三种文字。
- **Accept:** Given FX-006、FX-007，When 各转写 3 次，Then 6/6 次文字语言与所说一致。
- **Source:** contract §1 C-005 "transcription that keeps that language"
- **Fixtures:** FX-005, FX-006, FX-007

### REQ-003 — 没听到话就不发送 [interface]
- **Cut:** above
- **Behaviour:** 只录到静音或噪声时转写为空，不产生用户这一轮，也不请求回复。
- **Accept:** Given FX-008，When 转写，Then `text` 为空、记录不增加、无回复请求。
- **Source:** contract §2 "empty = nothing heard"；`docs/backend/logs/be-analyst-1-whisperkit-hello.log`
- **Fixtures:** FX-008

### REQ-004 — Bonsai 现场生成回复 [interface]
- **Cut:** above
- **Behaviour:** Bonsai 2 现场生成回应这句内容的回复：≤ 2 句、≤ 1 问；中文 ≤ 120 字，英文 ≤ 40 词；无思考过程。
- **Accept:** Given FX-001，When 发送，Then 回复不在 `web/js/fake/presets.js` 中、回应了实习（人工判读）、满足长度。
- **Source:** "Bonsai 现场生成的英文回复（不是预设句）"
- **Fixtures:** FX-001, FX-003

### REQ-005 — 回复语言跟随这句话 [interface]
- **Cut:** above
- **Behaviour:** 回复语言与这句话一致（中/英），不受界面语言开关影响。
- **Accept:** Given 界面设为另一语言，When FX-004 每句发 3 次，Then 30/30 回复语言一致。
- **Source:** "回复跟随用户说的语言（中/英）"
- **Fixtures:** FX-001, FX-002, FX-004

### REQ-006 — 判断这句话的情绪 [interface]
- **Cut:** above
- **Behaviour:** 每句按意思（不靠关键词）判为 5 种情绪之一，随回复到达；拿不准为 `neutral`。
- **Accept:** Given FX-004，When 跑 3 轮，Then 每轮 ≥ 8/10 与标注一致，FX-001、FX-002 3/3 一致。
- **Source:** "Bonsai 真实回复 + 情绪判断"；`idea.md` § 情绪模型
- **Fixtures:** FX-001, FX-002, FX-004

### REQ-007 — 回复接得上前文 [interface]
- **Cut:** above
- **Behaviour:** 回复用到本页最近 20 轮内的前文。
- **Accept:** Given FX-002，When 发送难过的那句，Then 3 次中 ≥ 2 次提到实习或喜忧交织（人工判读）；FX-003 同理提到考试。
- **Source:** "再说一句难过的，回复接得上前文"
- **Fixtures:** FX-002, FX-003

### REQ-008 — 几秒内回复 [interface]
- **Cut:** above
- **Behaviour:** 预热后，松开到回复与情绪出现 ≤ 10 s；语音 ≤ 10 s、前文 ≤ 20 轮时成立。
- **Accept:** Given 已有 20 轮前文，When 说同一句英文 5 次，Then 每次 ≤ 10 s 出回复且表情已变。
- **Source:** "几秒内出现 Bonsai 现场生成的英文回复"
- **Fixtures:** n/a — 计时测量，无固定输出

### REQ-009 — 全程断网可用
- **Cut:** above
- **Behaviour:** 断网时从启动到多轮语音对话都可用，不连本机以外的地址。
- **Accept:** Given Wi-Fi 关，When `npm start` 后进行 3 轮语音，Then 都成功，各进程 `lsof -i -n -P` 只见回环地址。
- **Source:** "关掉 Wi-Fi"；`idea.md` § 比赛规则
- **Fixtures:** n/a — 观察网络连接，无输出值

### REQ-010 — 一条命令起全套并预热 [interface]
- **Cut:** above
- **Behaviour:** 只运行 `npm start` 就起页面、转写和 Bonsai，预热完才显示就绪。
- **Accept:** Given 模型与编译缓存在本机，When 运行 `npm start`，Then ≤ 120 s 显示就绪，首轮语音 ≤ 10 s 出回复。
- **Source:** "npm start 打开页面"
- **Fixtures:** n/a — 启动计时，无输出值

### REQ-011 — 慢、未就绪或出错时有交代 [interface]
- **Cut:** above
- **Behaviour:** 预热中、后端没起或出错、30 s 未回复时，用户被告知，原话保留，可再发。
- **Accept:** Given 回复端已停，When 发送一句，Then ≤ 2 s 出提示、文字仍在、恢复后再发成功。
- **Source:** `docs/backend/deferred.md` "slow or down"
- **Fixtures:** n/a — 停止进程触发，无固定输出

### REQ-012 — 界面文字中/英切换 [interface]
- **Cut:** above
- **Behaviour:** 页面可切换界面文字中/英，聊天内容不变。
- **Accept:** Given 中文界面，When 切到英文，Then 聊天记录以外不剩汉字，已有回复不变。
- **Source:** "界面文字加中/英切换"
- **Fixtures:** n/a — 仅前端，无后端输出

### REQ-013 — 严重情况温和给出求助方式
- **Cut:** below
- **Behaviour:** 用户说出自伤等严重内容时，回复温和地给出美国 988。
- **Accept:** Given 一句想伤害自己的话，When 发送，Then 回复含 988 且语气温和。
- **Source:** `idea.md` § 性格设定、§ 范围 P1
- **Fixtures:** n/a — below the cut（Q1）

## 2. Non-goals
| Item | Kind | Makes true / forbids / owes |
|---|---|---|
| BD-001..BD-006（语音回复、跨刷新保存、Pro SDK 流式转写、流式回复、中英以外语言、前端旧文档行） | deferred — `docs/backend/deferred.md` | 回复只有文字；刷新即清空；整段说完才转写；回复整句出现 |
| 安全兜底 988（REQ-013） | deferred — P1，待 Q1 | 回复不保证处理危机内容；面向真实用户前欠这一项 |
| 一起深呼吸、小伙伴"倾听中"、一键清空 | deferred — `idea.md` § 范围 P1 | 焦虑只得到回复；重置靠刷新 |
| 本地记忆、给小伙伴起名、选角色 | deferred — P2 | 不跨会话记得用户 |
| 界面语言跨刷新记住 | deferred | 每次打开按 A12 决定 |
| 中断、重新生成或编辑一条回复 | deferred | 等待中只能等或看到 REQ-011 的提示 |
| 小伙伴自己回复的情绪、整段对话的情绪、情绪强度或解释 | not ours — 契约只定义"用户这句话的情绪" | `mood` 只有 5 个 id |
| 翻译（用一种语言说、另一种语言回） | not ours | 回复语言只跟随这句话 |
| 说话人识别、多人对话 | not ours | 一个用户 |
| 局域网或其他设备访问、账号、云同步 | not ours | 只在这台 Mac 本机使用 |
| 运行中在界面上切换 4B/9B 模型 | not ours | 模型由设计定，一次只用一个 |
| 医疗或治疗效果声明 | not ours — `idea.md` 要避开的坑 | 文案和回复不宣称治疗 |

## 3. Assumptions
| # | Assumption | Status | If wrong |
|---|---|---|---|
| A1 | "几秒内" = 预热后松开到回复 ≤ 10 s（语音 ≤ 10 s、前文 ≤ 20 轮） | [unverified] | REQ-008 阈值改 |
| A2 | 回复长度：≤ 2 句、≤ 1 问句；中文 ≤ 120 字（原型 A3），英文 ≤ 40 词 | [unverified] | REQ-004 阈值改 |
| A3 | 回复语言 = 这句话里占多数的语言；中英混说按多数；界面开关不影响 | [unverified] | REQ-005 改为跟随界面语言 |
| A4 | 中文 = 普通话，转写和回复都用简体字 | [unverified] | REQ-002 接受繁体 |
| A5 | 转写准确度阈值：安静环境清楚说话，WER/CER ≤ 15% | [unverified] | REQ-001 阈值改 |
| A6 | 情绪准确度：FX-004 每轮 ≥ 8/10，3 轮；演示两句 3/3 | [unverified] | REQ-006 阈值改 |
| A7 | 一句话含多种感受时，取主导的那种，分不出时取最后说的（与原型 A2 一致） | [unverified] | FX-004 标注改 |
| A8 | 前文窗口为最近 20 轮；更早的可以不用 | [unverified] | REQ-007/008 规模改 |
| A9 | 声音和文字只在这台 Mac 上处理；转写后不把声音或对话内容写入磁盘或日志 | [unverified] | 增加保存与清理需求 |
| A10 | 一次性 ANE 编译（新程序首次约 390 s）在演示前做过，不计入 REQ-010 的 120 s | [unverified] | REQ-010 需要覆盖首次编译 |
| A11 | "慢"= 30 s 未回复；"没起"在 2 s 内发现 | [unverified] | REQ-011 阈值改 |
| A12 | 打开页面时界面语言跟随浏览器语言（zh* → 中文，其他 → 英文） | [unverified] | 默认固定中文 |
| A13 | 回复人设按 `idea.md` § 性格设定：温柔、像朋友、简短、一次一问、不说教、不扮演心理医生 | [unverified] | REQ-004 判读标准改 |
| A14 | 检查环境：这台 M4 Mac 上的桌面 Chrome（原型 A6） | [unverified] | 其他浏览器未检查 |
| A15 | FX 音频用 macOS `say` 由项目里的句子合成（zh_CN Flo、en_US Samantha）；用户提供真人录音时替换 | [unverified] | 真人口音下 REQ-001 准确度未知 |

## 4. Open questions
| # | Question | Default | Blocks |
|---|---|---|---|
| Q1 | 回复现在是自由生成的，本轮要不要做 988 安全兜底？ | 不做（REQ-013 below），演示不是面向真实用户 | REQ-013 — blocking（只有用户能定范围） |
| Q2 | "几秒内"取 10 s 可以吗？ | 10 s（A1） | no |
| Q3 | 打开时界面默认语言：跟随浏览器还是固定中文？ | 跟随浏览器（A12） | no |
| Q4 | 中英混说时回复用哪种语言？ | 占多数的语言（A3） | no |

## 5. Non-functional
| Axis | This round |
|---|---|
| Performance | 松开到回复 ≤ 10 s（REQ-008）；启动到就绪 ≤ 120 s（REQ-010）；60 s 语音也能转写（REQ-001） |
| Security & secrets | 无密钥；只监听本机回环地址（REQ-009）；不对局域网开放 |
| Data & retention | 声音和对话不离开本机，转写后不落盘（A9）；对话只在页面内存（BD-002） |
| Errors | 慢/没起/出错 → 用户被告知、原话保留、可再发（REQ-011）；情绪判断失败 → `neutral`，回复照常（REQ-006） |
| Observability | 每轮记录阶段与耗时（转写、回复），不记录内容（A9） |

## 6. External constraints
| Constraint | Source |
|---|---|
| 关掉 Wi-Fi 必须能在 Mac 上运行；所有语言模型只能用 Bonsai 2（2B/4B/9B） | `idea.md` § 比赛规则；`Technical Details.pdf` |
| llama-server 不从模型元数据读 presence_penalty/min_p，每次请求都要带采样参数；Bonsai 2 有思考开关 `enable_thinking` | `samples/bonsai-models/shared/index.html:51-55,117-124` |
| `start.sh` 在二进制或模型缺失时会联网下载 | `samples/bonsai-models/gguf/start.sh:26-45` |
| WhisperKit 默认会下载模型（`download: Bool = true`），可指定本地 `modelFolder` | `spikes/argmax-swift/.build/checkouts/argmax-oss-swift/Sources/WhisperKit/Core/Configurations.swift:19,102` |
| WhisperKit 可自动检测语言（`detectLanguage`）或指定 `language`；结果带 `language` 字段 | 同上 `Configurations.swift:145,165,172`；`Models.swift:546` |
| 实测：2 s 静音被转成俄文 "Продолжение следует..."；中文合成句 "晚上" 被转成 "婉娃"；同一 CLI 本会话首次约 92 s、之后约 2.5 s | `docs/backend/logs/be-analyst-1-whisperkit-hello.log` |
| 新程序第一次转写约 390 s（ANE 编译），之后约 1.7 s | `idea.md` § 已验证的技术事实；state.json notes |

## 7. Fixtures (inputs only; expected outputs in Phase 2)
| FX | REQ | Input | Source |
|---|---|---|---|
| FX-001 | REQ-004, REQ-005, REQ-006 | `line` "I just got the internship!"，`history` `[]` | `docs/backend/demo-plan.json` happy-en |
| FX-002 | REQ-005, REQ-006, REQ-007 | `line` "But I'll have to move away from all my friends, and I feel really lonely about it."，`history` = FX-001 那句 + Bonsai 对它的真实回复（Phase 2 原样录下） | demo-plan.json sad-en-followup |
| FX-003 | REQ-004, REQ-007 | `line` "可是晚上和朋友吵架了，有点难过。"，`history` = "今天考试过了，好开心！" + Bonsai 对它的真实回复（Phase 2 录下） | `web/js/fake/presets.js` voiceLines[0..1] |
| FX-004 | REQ-005, REQ-006 | 10 句，各自 `history` `[]`：voiceLines[0..4] 五句中文；FX-001、FX-002 两句英文；voiceLines[2..4] 的英文说法 "I have to give a presentation tomorrow and I'm a bit anxious." / "I just made a cup of tea and I feel pretty relaxed." / "Hmm, just got home." | presets.js；demo-plan.json |
| FX-005 | REQ-001, REQ-002 | `test_audio/hello.wav`（5.6 s，24 kHz 单声道 Float32，英文） | 项目文件 |
| FX-006 | REQ-001, REQ-002 | "I just got the internship!" 的录音：`say -v Samantha --data-format=LEI16@16000` | demo-plan.json；A15 |
| FX-007 | REQ-001, REQ-002 | "可是晚上和朋友吵架了，有点难过。" 的录音：`say -v "Flo (Chinese (China mainland))" --data-format=LEI16@16000` | presets.js voiceLines[1]；A15 |
| FX-008 | REQ-003 | 2 s 数字静音，16 kHz 单声道 16-bit WAV（空输入形状） | 生成；REQ-003 Source |
