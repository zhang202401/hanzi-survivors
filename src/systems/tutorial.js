const KEY = 'hanzi-survivors-tutorial-done';

/** 家长引导（首次进入显示一次） */
export function maybeShowTutorial(onDone) {
  let done = false;
  try {
    done = localStorage.getItem(KEY) === '1';
  } catch (e) { /* ignore */ }
  if (done) {
    onDone && onDone();
    return;
  }

  const root = document.getElementById('overlay');
  root.innerHTML = '';
  root.style.display = 'flex';

  const panel = document.createElement('div');
  panel.className = 'report-panel';
  panel.innerHTML = `
    <div class="report-title">家长须知</div>
    <div class="tut-step"><b>🕹 移动</b><span>手机：按住屏幕拖动 · 电脑：WASD / 方向键 · Shift 冲刺<br>小怪兽自动攻击，孩子专注走位躲避</span></div>
    <div class="tut-step"><b>🔊 听音选字</b><span>升级时语音读出一个字，孩子在 4 个大字里点选<br>点一下先听这个字的读音，再点一下确认</span></div>
    <div class="tut-step"><b>🎤 喊字升级</b><span>技能卡出现后，孩子要【大声喊出卡片上的汉字】才能升级技能<br>只认声音，不认手指！识别不灵时让孩子靠近麦克风、大声慢说</span></div>
    <div class="tut-step"><b>🛡 Boss 识字护盾</b><span>语音读字，操控角色跑到正确的字上撞碎护盾</span></div>
    <div class="tut-step"><b>🌐 浏览器要求</b><span>语音识别需要 Chrome / Edge 等浏览器并允许麦克风权限<br>识别结果会走浏览器服务（联网），本地不保存录音</span></div>
  `;

  const go = document.createElement('button');
  go.className = 'rp-btn primary';
  go.textContent = '开始认字 ▶';
  go.addEventListener('click', () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch (e) { /* ignore */ }
    root.style.display = 'none';
    root.innerHTML = '';
    onDone && onDone();
  });
  panel.appendChild(go);
  root.appendChild(panel);
}

export function resetTutorial() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) { /* ignore */ }
}
