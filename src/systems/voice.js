/**
 * 语音系统（浏览器内置，零成本零素材）：
 * - speak(): Web Speech TTS，中文朗读题目/鼓励语
 * - listen(): Web Speech 语音识别（ASR），小朋友喊出汉字 → 匹配卡片
 *
 * 识别匹配策略（幼儿发音容错）：
 *  1. 说话文本里包含卡片汉字 → 直接命中（喊"大小"也能选中"大"）
 *  2. 遍历多个识别候选（maxAlternatives）
 *  3. 汉字未命中但拼音音节命中 → 按拼音匹配（普通话不标准也有机会）
 *  4. 同音字歧义时取第一个命中卡片（一次只亮 3 张卡，歧义概率低）
 */
let enabled = true;
try {
  enabled = localStorage.getItem('hanzi-survivors-voice') !== '0';
} catch (e) { /* ignore */ }

const SRClass = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : undefined;

export const voice = {
  get enabled() {
    return enabled;
  },
  toggle() {
    enabled = !enabled;
    if (!enabled) this.stop();
    try {
      localStorage.setItem('hanzi-survivors-voice', enabled ? '1' : '0');
    } catch (e) { /* ignore */ }
    return enabled;
  },
  supported() {
    return 'speechSynthesis' in window;
  },
  stop() {
    try {
      window.speechSynthesis?.cancel();
    } catch (e) { /* ignore */ }
  },
  /**
   * 朗读文本；开关关闭或环境不支持时静默跳过。
   * opts.onEnd：朗读结束回调（用于"跟读提示"读完再恢复聆听，避免麦克风录到扬声器声音）。
   */
  speak(text, { rate = 0.95, onEnd } = {}) {
    if (!enabled || !text || !('speechSynthesis' in window)) {
      if (onEnd) setTimeout(onEnd, 120);
      return;
    }
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = rate; // 幼儿听语速稍慢
      u.pitch = 1.05;
      if (onEnd) {
        u.onend = () => { try { onEnd(); } catch (e) { /* ignore */ } };
        u.onerror = () => { try { onEnd(); } catch (e) { /* ignore */ } };
      }
      window.speechSynthesis.cancel(); // 打断上一条，避免排队堆积
      window.speechSynthesis.speak(u);
    } catch (e) {
      if (onEnd) setTimeout(onEnd, 120);
    }
  },

  // ================= 语音识别（喊字选卡） =================

  /** 浏览器是否支持语音识别 */
  asrSupported() {
    return !!SRClass;
  },

  /**
   * 开始一次听写。
   * onHeard(texts[])：识别结束/中间结果回调，texts 为候选文本数组（第一个是最佳结果）。
   * onEnd()：本次识别会话结束（无论成功失败）。
   * 返回是否成功启动。
   */
  listen(onHeard, onEnd) {
    if (!SRClass) return false;
    try {
      const rec = new SRClass();
      rec.lang = 'zh-CN';
      rec.interimResults = true;   // 中间结果也播报，孩子喊完立刻有反馈
      rec.maxAlternatives = 6;     // 多候选：发音不准也能捞到对的字
      rec.continuous = false;

      rec.onresult = (event) => {
        const texts = [];
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          for (let j = 0; j < res.length && j < 6; j++) {
            if (res[j].transcript) texts.push(res[j].transcript);
          }
        }
        if (texts.length && onHeard) onHeard(texts);
      };
      rec.onerror = () => { /* no-audio/network 等错误静默，onEnd 统一处理 */ };
      rec.onend = () => { if (onEnd) onEnd(); };
      rec.start();
      return true;
    } catch (e) {
      return false;
    }
  },

  /** 停止识别（不触发 onEnd 重启循环） */
  stopListen(rec) {
    try {
      if (rec) rec.abort();
    } catch (e) { /* ignore */ }
  },

  /**
   * 匹配：喊的内容是否命中某张卡。
   * cards: [{ char, plain, ... }]；texts: 候选说话文本数组。
   * 返回命中的卡片 或 null。
   */
  matchCards(cards, texts) {
    for (const raw of texts || []) {
      const said = String(raw).replace(/[\s,，。！!？?、·~～]/g, '');
      if (!said) continue;
      // 1) 文本包含卡片汉字（喊词语也算对，"大象"包含"大"）
      for (const card of cards) {
        if (card.char && said.includes(card.char)) return card;
      }
      // 2) 提取拼音音节匹配（汉字未命中时，如识别成同音其他字）
      const spoken = said.toLowerCase();
      for (const card of cards) {
        if (card.plain && spoken.includes(card.plain)) return card;
      }
    }
    return null;
  },
};
