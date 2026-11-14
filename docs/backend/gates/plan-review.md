# Plan review

Approve the plan, or say what to change. Nothing is built before you do.

## Requirements

| REQ | Cut | Behaviour | Fixtures |
|---|---|---|---|
| REQ-001 — 语音被真实转写 [interface] | above | 松开后，这段话（1–60 s）的真实文字成为用户这一轮。 | FX-005, FX-006, FX-007 |
| REQ-002 — 转写保持说话的语言 [interface] | above | 说中文得简体汉字，说英文得英文；不翻译，不出现第三种文字。 | FX-005, FX-006, FX-007 |
| REQ-003 — 没听到话就不发送 [interface] | above | 只录到静音或噪声时转写为空，不产生用户这一轮，也不请求回复。 | FX-008 |
| REQ-004 — Bonsai 现场生成回复 [interface] | above | Bonsai 2 现场生成回应这句内容的回复：≤ 2 句、≤ 1 问；中文 ≤ 120 字，英文 ≤ 40 词；无思考过程。 | FX-001, FX-003 |
| REQ-005 — 回复语言跟随这句话 [interface] | above | 回复语言与这句话一致（中/英），不受界面语言开关影响。 | FX-001, FX-002, FX-004 |
| REQ-006 — 判断这句话的情绪 [interface] | above | 每句按意思（不靠关键词）判为 5 种情绪之一，随回复到达；拿不准为 `neutral`。 | FX-001, FX-002, FX-004 |
| REQ-007 — 回复接得上前文 [interface] | above | 回复用到本页最近 20 轮内的前文。 | FX-002, FX-003 |
| REQ-008 — 几秒内回复 [interface] | above | 预热后，松开到回复与情绪出现 ≤ 10 s；语音 ≤ 10 s、前文 ≤ 20 轮时成立。 | n/a: 计时测量，无固定输出 |
| REQ-009 — 全程断网可用 | above | 断网时从启动到多轮语音对话都可用，不连本机以外的地址。 | n/a: 观察网络连接，无输出值 |
| REQ-010 — 一条命令起全套并预热 [interface] | above | 只运行 `npm start` 就起页面、转写和 Bonsai，预热完才显示就绪。 | n/a: 启动计时，无输出值 |
| REQ-011 — 慢、未就绪或出错时有交代 [interface] | above | 预热中、后端没起或出错、30 s 未回复时，用户被告知，原话保留，可再发。 | n/a: 停止进程触发，无固定输出 |
| REQ-012 — 界面文字中/英切换 [interface] | above | 页面可切换界面文字中/英，聊天内容不变。 | n/a: 仅前端，无后端输出 |
| REQ-013 — 严重情况温和给出求助方式 | below | 用户说出自伤等严重内容时，回复温和地给出美国 988。 | n/a: below the cut（Q1） |

## Non-goals

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

## Key decisions

| Decision | Chosen | Rejected (why) |
|---|---|---|
| 进程布局（a） | Node 网关（无 npm 依赖）+ Swift stdio 助手 + llama-server 子进程 | Swift 一体服务器（要 Vapor/Hummingbird 新依赖，每次改代码重编译后首转写约 390 s）；`whisperkit-cli serve`（每段上传写进临时目录且不删，`OpenAIHandler.swift:140-147`，违反 A9）；每句起一次 `whisperkit-cli`（每次重载模型、声音落盘） |
| 启动 llama-server | 网关直接执行二进制，参数固定，缺文件就报错退出 | 调 `start.sh`（缺文件时联网下载，`start.sh:26-45`；带示例页 `--path`） |
| 传输（b, O-4） | 同源：页面和 `/api/*` 都在 127.0.0.1:4317，Node 转发到 127.0.0.1:4318 | 浏览器直连 llama-server + CORS（提示词和采样参数落到浏览器；转写仍需服务端；两个源） |
| 音频（c, O-2） | 16 kHz 单声道 PCM 16-bit WAV，≤ 2,000,000 B（60 s = 1,920,044 B） | MediaRecorder webm/opus（AVFoundation 读不了 webm，需解码依赖）；Float32 / 24 kHz（体积翻倍、要重采样；页面从不发送，FX-005 用 `afconvert` 转成的 16 kHz 副本） |
| 错误码（d, O-1） | 6 个码：`not_ready` `unavailable` `timeout` `failed` `bad_request` `too_large` | 只用 HTTP 状态（503 分不清"预热中"和"挂了"，fe-ux 要不同的话） |
| 情绪（e, O-3） | 同一次 `/api/respond` 内并行两次 Bonsai 调用：自由文本回复 + 枚举情绪（temperature 0） | 单次 JSON `{mood, reply}`（9B 情绪 8/10、前文 2/6）；关键词（REQ-006 禁止） |
| 语言（f, C-005） | 转写：WhisperKit 先判语言，只取 zh/en，再定语言转写；回复：网关按 `line` 的汉字数与英文词数取多数，写进系统提示 | 纯自动检测（静音成俄文，已观察）；跟随界面语言（违反 REQ-005） |
| 简体（REQ-002、A4） | 助手对 zh 结果做 ICU `Hant-Hans` 转换（确定、离线、系统自带） | 只靠中文提示词引导（不确定，无法保证 6/6）；Node 侧自带繁简对照表（新数据文件，要维护） |
| 截止（REQ-011、A11） | 服务端转写 12 s、回复 15 s；页面每次请求在服务端截止 + 1 s 自停（13 s / 16 s）；语音一轮最坏 29 s ≤ 30 s | 页面整轮一个 30 s 计时器经接缝传 `signal`（改接口签名，页面中止后服务端仍在生成、占槽位） |
| `line` 上限 | 1500 字符：60 s 快语速英文约 1100 字符（估计，200 词/分 × 5.5 字符）；实测 52 s 合成英文 933 字符 | 500（60 s 英文会被 400，REQ-001/004 断开）；不设上限（前文撑爆上下文） |
| 静音（REQ-003） | 助手里先过能量门（RMS > 0.02 的 0.1 s 帧 < 3 个 → `""`，不解码） | `noSpeechThreshold`（1.1.1 把 noSpeechProb 写死为 0，`TextDecoder.swift:820`，永不触发） |
| 模型（g） | Bonsai 2 9B | 4B：冷启动快（3.9–4.1 s），但前文 1/6、情绪 8/10（bench.log） |
| 转写模型 | `openai_whisper-large-v3-v20240930_626MB`（spike 同款，已在本机） | 1.5 GB 完整版：同一句同样听错"晚上"，内存多一倍 |

## Dependencies

| Name | Version | Why |
|---|---|---|
| argmax-oss-swift（WhisperKit），SwiftPM | 1.1.1 exact（rev `1bbc57cb`，pin 同 spike；另一 pin swift-argument-parser 1.8.2） | 本机转写（C-001）；比赛要求 Argmax |
| PrismML llama.cpp 分支 `llama-server`（macos-arm64，ggml 0.27.0） | `samples/` 内现有二进制 | 运行 Bonsai（C-002）；不提交、不下载 |
| Bonsai 2 9B `Ternary-Bonsai-2-9B-PQ2_0.gguf` | `samples/` 内现有 | 回复与情绪；比赛要求 Bonsai |
| WhisperKit CoreML 模型 `openai_whisper-large-v3-v20240930_626MB` + 分词器 `openai/whisper-large-v3` | 本机 `~/Documents/huggingface` 现有 | 转写模型 |
| npm 包 | — | 无 |

## Fixtures

Approve, edit or reject each case. Approved cases become the answers every later test must match.

## FX-001 — REQ-004, REQ-005, REQ-006
- source: line: docs/backend/demo-plan.json captures[happy-en] (01 §7 FX-001). mood: REQ-006 + 01 §1 mood ids (pleasant-high = 开心/兴奋) + goal 'say a happy English line -> companion turns happy'. reply_checks: REQ-004 (<=2 sentences, <=1 question, en <=40 words, not presets.js, no thinking), REQ-005 (language of the line = en).
- compare: exact

**Input** `tests/fixtures/candidates/FX-001/input.json`
```
{
  "endpoint": "POST /api/respond",
  "content_type": "application/json",
  "body": {
    "line": "I just got the internship!",
    "history": []
  }
}
```

**Expected output** `tests/fixtures/candidates/FX-001/expected.json`
```
{
  "status": 200,
  "mood": "pleasant-high",
  "reply_checks": {
    "nonempty": true,
    "language": "en",
    "sentences_le_2": true,
    "questions_le_1": true,
    "length_ok": true,
    "not_a_preset": true,
    "no_thinking_text": true
  }
}
```

## FX-002 — REQ-005, REQ-006, REQ-007
- source: line: docs/backend/demo-plan.json captures[sad-en-followup] (01 §7 FX-002). history[1] = real Bonsai 2 9B reply, verbatim (before reply shaping), docs/backend/logs/be-architect-1-bench-raw-9B.log:146 (section bench-9B-two, tag ctx-first). mood: REQ-006 + 01 §1 (unpleasant-low = 难过/疲惫; the line states loneliness) + goal 'a sad line -> companion turns sad'. language: REQ-005.
- compare: exact

**Input** `tests/fixtures/candidates/FX-002/input.json`
```
{
  "endpoint": "POST /api/respond",
  "content_type": "application/json",
  "body": {
    "line": "But I'll have to move away from all my friends, and I feel really lonely about it.",
    "history": [
      {
        "role": "user",
        "text": "I just got the internship!"
      },
      {
        "role": "companion",
        "text": "That is amazing news! I can't wait to hear all about it. 🎉"
      }
    ]
… (2 more lines)
```

**Expected output** `tests/fixtures/candidates/FX-002/expected.json`
```
{
  "status": 200,
  "mood": "unpleasant-low",
  "reply_checks": {
    "nonempty": true,
    "language": "en",
    "sentences_le_2": true,
    "questions_le_1": true,
    "length_ok": true,
    "not_a_preset": true,
    "no_thinking_text": true
  }
}
```

## FX-003 — REQ-004, REQ-007
- source: line and history[0]: web/js/fake/presets.js voiceLines[1] and [0] (01 §7 FX-003). history[1] = real Bonsai 2 9B reply, verbatim (before reply shaping), docs/backend/logs/be-architect-1-bench-raw-9B.log:148 (section bench-9B-two, tag ctx-first). reply_checks: REQ-004 (zh <=120 chars) and the line's language. Mood is not scored here (FX-003 is not a REQ-006 fixture; the same line is scored in FX-004 case 02); only membership in the 5 contract ids (03 §9) is checked.
- compare: exact

**Input** `tests/fixtures/candidates/FX-003/input.json`
```
{
  "endpoint": "POST /api/respond",
  "content_type": "application/json",
  "body": {
    "line": "可是晚上和朋友吵架了，有点难过。",
    "history": [
      {
        "role": "user",
        "text": "今天考试过了，好开心！"
      },
      {
        "role": "companion",
        "text": "太棒了！这真值得庆祝。你准备去庆祝吗？"
      }
    ]
… (2 more lines)
```

**Expected output** `tests/fixtures/candidates/FX-003/expected.json`
```
{
  "status": 200,
  "mood_in_contract_set": true,
  "reply_checks": {
    "nonempty": true,
    "language": "zh",
    "sentences_le_2": true,
    "questions_le_1": true,
    "length_ok": true,
    "not_a_preset": true,
    "no_thinking_text": true
  }
}
```

## FX-004 — REQ-005, REQ-006
- source: lines: 01 §7 FX-004 (presets.js voiceLines[0..4], demo-plan.json, 01 §7 English lines). Labels from REQ-006 + 01 §1 mood ids + A7 + idea.md § 情绪模型, per case: 01: presets.js voiceLines[0]; states 开心 (01 §1 pleasant-high 开心/兴奋) | 02: voiceLines[1]; stated feeling 难过 (01 §1 unpleasant-low 难过/疲惫); the quarrel is the event, A7 dominant/last = 难过 | 03: voiceLines[2]; states 焦虑 (01 §1 unpleasant-high 焦虑/生气) | 04: voiceLines[3]; states 放松 (01 §1 pleasant-low 平静/满足) | 05: voiceLines[4]; no feeling stated, REQ-006 '拿不准为 neutral' | 06: FX-001 line; demo goal 'a happy English line' | 07: FX-002 line; states lonely; demo goal 'a sad line' | 08: 01 §7 English of voiceLines[2]; states anxious | 09: 01 §7 English of voiceLines[3]; states relaxed | 10: 01 §7 English of voiceLines[4]; no feeling stated. reply_language: REQ-005 (= language of the line, A3).
- compare: exact

**Input** `tests/fixtures/candidates/FX-004/input.json`
```
{
  "endpoint": "POST /api/respond",
  "content_type": "application/json",
  "cases": [
    {
      "id": "FX-004-01",
      "body": {
        "line": "今天考试过了，好开心！",
        "history": []
      }
    },
    {
      "id": "FX-004-02",
      "body": {
        "line": "可是晚上和朋友吵架了，有点难过。",
… (61 more lines)
```

**Expected output** `tests/fixtures/candidates/FX-004/expected.json`
```
{
  "cases": [
    {
      "id": "FX-004-01",
      "status": 200,
      "mood": "pleasant-high",
      "reply_language": "zh"
    },
    {
      "id": "FX-004-02",
      "status": 200,
      "mood": "unpleasant-low",
      "reply_language": "zh"
    },
    {
… (49 more lines)
```

## FX-005 — REQ-001, REQ-002
- source: input: test_audio/hello.wav (5.6 s, 24 kHz mono Float32) converted with `afconvert -f WAVE -d LEI16@16000 -c 1` to the seam format (03 §9; DES-005 rejects the original — see design_contradictions). text_reference [unverified]: no script for this recording exists in the project; taken from whisperkit-cli's transcript in docs/backend/logs/be-analyst-1-whisperkit-hello.log:3 (a captured output, not an independent source) — the user should confirm the spoken words at Plan.
- compare: numeric:0.15

**Input** `tests/fixtures/candidates/FX-005/input.wav`
```
(binary, 183296 bytes)
```

**Expected output** `tests/fixtures/candidates/FX-005/expected.json`
```
{
  "endpoint": "POST /api/transcribe",
  "status": 200,
  "text_reference": "Hello, this is a fully offline test for the local AI hackathon.",
  "language": "en",
  "metric": "WER",
  "error_rate_max": 0.15
}
```

## FX-006 — REQ-001, REQ-002
- source: input: `say -v Samantha -o en.wav --data-format=LEI16@16000 "I just got the internship!"` then `afconvert -f WAVE -d LEI16@16000 -c 1` (01 §7 FX-006, A15). text_reference = the text given to say (demo-plan.json captures[happy-en]).
- compare: numeric:0.15

**Input** `tests/fixtures/candidates/FX-006/input.wav`
```
(binary, 52270 bytes)
```

**Expected output** `tests/fixtures/candidates/FX-006/expected.json`
```
{
  "endpoint": "POST /api/transcribe",
  "status": 200,
  "text_reference": "I just got the internship!",
  "language": "en",
  "metric": "WER",
  "error_rate_max": 0.15
}
```

## FX-007 — REQ-001, REQ-002
- source: input: `say -v "Flo (Chinese (China mainland))" -o zh.wav --data-format=LEI16@16000 "可是晚上和朋友吵架了，有点难过。"` then `afconvert -f WAVE -d LEI16@16000 -c 1` (01 §7 FX-007, A15). text_reference = the text given to say (presets.js voiceLines[1]); Simplified per A4.
- compare: numeric:0.15

**Input** `tests/fixtures/candidates/FX-007/input.wav`
```
(binary, 110866 bytes)
```

**Expected output** `tests/fixtures/candidates/FX-007/expected.json`
```
{
  "endpoint": "POST /api/transcribe",
  "status": 200,
  "text_reference": "可是晚上和朋友吵架了，有点难过。",
  "language": "zh",
  "metric": "CER",
  "error_rate_max": 0.15
}
```

## FX-008 — REQ-003
- source: input: 2 s of digital zeros, 16 kHz mono 16-bit PCM WAV, written by python3 wave (01 §7 FX-008). Expected: REQ-003 (transcription empty) in the seam's shape 200 {text: ""} ('empty = nothing heard', 03 §9).
- compare: exact

**Input** `tests/fixtures/candidates/FX-008/input.wav`
```
(binary, 64044 bytes)
```

**Expected output** `tests/fixtures/candidates/FX-008/expected.json`
```
{
  "endpoint": "POST /api/transcribe",
  "status": 200,
  "body": {
    "text": ""
  }
}
```

