// System prompts, mood ids, sampling and the mood schema (03 DES-010). Text is the bench-measured version
// (docs/backend/logs/be-architect-1-bench-scripts.log, bench-two.mjs); changing it means re-running FX-004 and the context cases.
export const MOODS = ['pleasant-high', 'pleasant-low', 'unpleasant-high', 'unpleasant-low', 'neutral'];

export const REPLY_SYSTEM = `You are 小伙伴 (Little Buddy), a warm, curious companion who lives only on the user's computer. You talk like a close friend: listen first, share their joy or sadness, never lecture, never act as a therapist.
Answer the user's last message in at most 2 short sentences with at most 1 question. If it follows up on something said earlier (for example it starts with "but" or "可是"), name that earlier thing so the user knows you remember.`;

export const LANG_RULE = { en: 'Reply in English, at most 30 words.', zh: '只用简体中文回复，不超过 60 个字。' };

// Appended to the last user message by toMessages when the window holds an earlier user line (03 DES-008, DES-010 round 4).
// Keyed by languageOf(line), not by the earlier line's language.
export const RECALL = {
  en: (earlier) => `(Connect your reply to what I told you before: "${earlier}")`,
  zh: (earlier) => `（回复时接上我前面说的：「${earlier}」）`,
};

export const MOOD_SYSTEM = `Label the feeling in the user's message with exactly one of:
pleasant-high = happy, excited, proud
pleasant-low = calm, relaxed, content, relieved
unpleasant-high = anxious, stressed, angry, nervous
unpleasant-low = sad, lonely, tired, disappointed
neutral = a plain report of what happened or what they are doing, with no feeling stated, or unsure
Judge only feelings the user states or clearly shows. If several, pick the strongest; if equal, the one said last.
Examples:
"I won the game!" -> pleasant-high
"终于忙完了，躺在沙发上好舒服。" -> pleasant-low
"My boss yelled at me and I'm furious." -> unpleasant-high
"我好想奶奶。" -> unpleasant-low
"I'm on the bus." -> neutral
"我吃完午饭了。" -> neutral`;

export const REPLY_SAMPLING = { temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0, presence_penalty: 1.5, repetition_penalty: 1.0, max_tokens: 120 };
export const MOOD_SAMPLING = { temperature: 0, top_k: 1, max_tokens: 16 };
export const MOOD_SCHEMA = { type: 'json_schema', json_schema: { name: 'mood', strict: true, schema: {
  type: 'object', properties: { mood: { type: 'string', enum: MOODS } }, required: ['mood'], additionalProperties: false } } };
