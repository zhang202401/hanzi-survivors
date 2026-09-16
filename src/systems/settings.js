import { audio } from './audio.js';
import { voice } from './voice.js';

/** 读取性能模式（省电模式：敌量/粒子降档） */
export function isPerfMode() {
  try {
    return localStorage.getItem('hanzi-survivors-perf') === '1';
  } catch (e) {
    return false;
  }
}

/** 小主角颜色（孩子可在家长设置里换） */
export const SKINS = [
  { id: 'gold', name: '小金豆', tint: 0xfbbf24 },
  { id: 'cyan', name: '小蓝鲸', tint: 0x22d3ee },
  { id: 'violet', name: '小紫葡萄', tint: 0xa78bfa },
  { id: 'rose', name: '小桃子', tint: 0xf472b6 },
];

export function getSkin() {
  try {
    const id = localStorage.getItem('hanzi-survivors-skin');
    return SKINS.find((s) => s.id === id) || SKINS[0];
  } catch (e) {
    return SKINS[0];
  }
}

export function setSkin(id) {
  try {
    localStorage.setItem('hanzi-survivors-skin', id);
  } catch (e) { /* ignore */ }
}

/** 家长设置面板（DOM 浮层）：音量 / 语音朗读 / 麦克风测试 / 性能模式 / 学字档案管理 */
export function showSettings(onClose) {
  const root = document.getElementById('overlay');
  root.innerHTML = '';
  root.style.display = 'flex';

  const panel = document.createElement('div');
  panel.className = 'report-panel';
  panel.innerHTML = `<div class="report-title">⚙ 家长设置</div>`;

  // 音量
  const volRow = document.createElement('div');
  volRow.className = 'set-row';
  volRow.innerHTML = `<span>🔊 音量</span>`;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = String(Math.round(audio.getVolume() * 100));
  slider.addEventListener('input', () => {
    audio.ensure();
    audio.setVolume(Number(slider.value) / 100);
    if (audio.muted) audio.toggle();
  });
  volRow.appendChild(slider);
  panel.appendChild(volRow);

  // 语音朗读开关（题目朗读 + 选卡确认）
  const voiceBtn = document.createElement('button');
  voiceBtn.className = 'rp-btn';
  const renderVoice = () => (voiceBtn.textContent = voice.enabled ? '🗣 语音朗读：开' : '🗣 语音朗读：关');
  voiceBtn.addEventListener('click', () => {
    voice.toggle();
    renderVoice();
  });
  renderVoice();
  panel.appendChild(voiceBtn);

  // 麦克风测试：喊一句话看识别结果（验证喊字选卡可用性）
  const micBtn = document.createElement('button');
  micBtn.className = 'rp-btn';
  micBtn.textContent = voice.asrSupported() ? '🎤 麦克风测试（喊一个字试试）' : '🎤 此浏览器不支持语音识别（请用 Chrome/Edge）';
  micBtn.addEventListener('click', () => {
    if (!voice.asrSupported()) return;
    micBtn.textContent = '🎤 正在听……请喊一个字！';
    const ok = voice.listen(
      (texts) => {
        micBtn.textContent = '🎤 听到：' + texts[0];
      },
      () => {
        setTimeout(() => { micBtn.textContent = '🎤 麦克风测试（再试一次）'; }, 1200);
      }
    );
    if (!ok) micBtn.textContent = '🎤 麦克风启动失败（检查权限）';
  });
  panel.appendChild(micBtn);

  // 性能模式
  const perfBtn = document.createElement('button');
  perfBtn.className = 'rp-btn';
  const renderPerf = () => (perfBtn.textContent = isPerfMode() ? '🏃 性能模式：开（旧手机建议）' : '🌿 画质优先：开');
  renderPerf();
  perfBtn.addEventListener('click', () => {
    try {
      localStorage.setItem('hanzi-survivors-perf', isPerfMode() ? '0' : '1');
    } catch (e) { /* ignore */ }
    renderPerf();
  });
  panel.appendChild(perfBtn);

  // 小主角颜色
  const skinRow = document.createElement('div');
  skinRow.className = 'set-row';
  skinRow.innerHTML = `<span>🎨 小主角</span>`;
  const skinBtns = [];
  SKINS.forEach((s) => {
    const b = document.createElement('button');
    b.className = 'rp-btn';
    b.style.minHeight = '40px';
    b.style.padding = '4px';
    b.textContent = s.name;
    const render = () => {
      const cur = getSkin();
      b.style.borderColor = cur.id === s.id ? '#' + s.tint.toString(16).padStart(6, '0') : '#2a3a5e';
      b.style.color = cur.id === s.id ? '#' + s.tint.toString(16).padStart(6, '0') : '#8ea2c0';
    };
    b.addEventListener('click', () => {
      setSkin(s.id);
      skinBtns.forEach(render);
    });
    render();
    skinBtns.push(b);
    skinRow.appendChild(b);
  });
  panel.appendChild(skinRow);

  const note = document.createElement('div');
  note.className = 'rp-advice';
  note.textContent = '技能卡只能靠【喊字】升级（语音识别），不支持点选。识别不灵时：让孩子离麦克风近一点、大声慢一点说。';
  panel.appendChild(note);

  // 学字档案管理
  const dataRow = document.createElement('div');
  dataRow.className = 'rp-btns';
  const exportBtn = document.createElement('button');
  exportBtn.className = 'rp-btn';
  exportBtn.textContent = '📤 导出档案';
  exportBtn.addEventListener('click', () => {
    const raw = localStorage.getItem('hanzi-survivors-profile-v1') || '{}';
    const blob = new Blob([raw], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hanzi-survivors-档案.json';
    a.click();
  });
  const resetBtn = document.createElement('button');
  resetBtn.className = 'rp-btn';
  resetBtn.textContent = '🗑 清空学字记录';
  resetBtn.addEventListener('click', () => {
    if (resetBtn.dataset.confirm) {
      try {
        localStorage.removeItem('hanzi-survivors-profile-v1');
        localStorage.removeItem('hanzi-survivors-tutorial-done');
      } catch (e) { /* ignore */ }
      resetBtn.textContent = '✔ 已清空';
    } else {
      resetBtn.dataset.confirm = '1';
      resetBtn.textContent = '⚠ 再点一次确认清空';
    }
  });
  dataRow.appendChild(exportBtn);
  dataRow.appendChild(resetBtn);
  panel.appendChild(dataRow);

  const close = document.createElement('button');
  close.className = 'rp-btn primary';
  close.textContent = '返回';
  close.addEventListener('click', () => {
    root.style.display = 'none';
    root.innerHTML = '';
    onClose && onClose();
  });
  panel.appendChild(close);

  root.appendChild(panel);
}
