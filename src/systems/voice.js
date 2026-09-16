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

// ================= 中文音色优选 =================
// 不同设备默认音色差异很大（Windows 默认偏机械、Edge 自带晓晓等神经网络音很自然）。
// 策略：按音色名评分选最自然的中文语音；家长也可在设置里手动挑选（持久化）。
let cachedVoices = [];
let userVoiceName = null;
try {
  userVoiceName = localStorage.getItem('hanzi-survivors-tts-voice') || null;
} catch (e) { /* ignore */ }

/** 音色自然度评分（越高越好；非中文返回 -1） */
function scoreVoice(v) {
  if (!v || !/^(zh|cmn|yue)/i.test(v.lang)) return -1;
  const n = (v.name || '').toLowerCase();
  let s = 10;
  if (/zh[-_]cn|zh-cn|cmn-hans/i.test(v.lang)) s += 30; // 大陆普通话优先于港台腔
  else if (/^zh|cmn/i.test(v.lang)) s += 8;
  if (n.includes('natural') || n.includes('neural')) s += 80; // Edge/Azure 神经网络音（最自然）
  if (/xiaoxiao|晓晓/.test(n)) s += 50;
  if (/xiaoyi|晓伊|yunxi|云希|yunyang|云扬|yunjian|云健|yunye|云野|xiaoshuang|晓双/.test(n)) s += 40;
  if (/xiaohan|晓涵|xiaomo|晓墨|xiaomeng|晓梦|xiaoxuan|晓萱|xiaorui|晓睿|yunze|云泽/.test(n)) s += 40;
  if (n.includes('google')) s += 45; // Chrome 联网普通话（自然度不错）
  if (/tingting|婷婷|meijia|美佳/.test(n)) s += 15; // macOS/常规本地音
  if (v.localService) s += 4; // 本地音不依赖网络，稍稳
  return s;
}

function refreshVoices() {
  if (!('speechSynthesis' in window)) return;
  const list = window.speechSynthesis.getVoices() || [];
  if (list.length) cachedVoices = list;
}

/** 按自然度排序的中文音色列表（设置面板用） */
export function zhVoices() {
  refreshVoices();
  return [...cachedVoices]
    .filter((v) => /^(zh|cmn|yue)/i.test(v.lang))
    .sort((a, b) => scoreVoice(b) - scoreVoice(a));
}

function pickVoice() {
  refreshVoices();
  if (!cachedVoices.length) return null;
  if (userVoiceName) {
    const chosen = cachedVoices.find((v) => v.name === userVoiceName);
    if (chosen && /^(zh|cmn|yue)/i.test(chosen.lang)) return chosen;
  }
  // 自动模式：取评分最高的中文音色
  let best = null;
  let bestScore = -1;
  for (const v of cachedVoices) {
    const s = scoreVoice(v);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return bestScore >= 0 ? best : null;
}

// 音色列表是异步加载的：监听变化事件持续刷新
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

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
  /** 家长设置：手动选择音色（传 null 恢复自动优选） */
  setVoiceName(name) {
    userVoiceName = name;
    try {
      if (name) localStorage.setItem('hanzi-survivors-tts-voice', name);
      else localStorage.removeItem('hanzi-survivors-tts-voice');
    } catch (e) { /* ignore */ }
  },
  getVoiceName() {
    return userVoiceName;
  },
  /** 当前实际生效的音色名（显示用） */
  activeVoiceName() {
    const v = pickVoice();
    return v ? v.name : '（系统默认）';
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
  speak(text, { rate = 0.92, onEnd } = {}) {
    if (!enabled || !text || !('speechSynthesis' in window)) {
      if (onEnd) setTimeout(onEnd, 120);
      return;
    }
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      const v = pickVoice();
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }
      u.rate = rate; // 幼儿听语速稍慢；不变调（pitch 改动会明显降自然度）
      u.pitch = 1;
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
