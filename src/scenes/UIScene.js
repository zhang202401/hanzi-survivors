import Phaser from 'phaser';
import { COLORS, FONT } from '../config.js';
import { drawThreeCards } from '../data/skills.js';
import { drawMixedCards } from '../data/weapons.js';
import FloatingJoystick from '../systems/joystick.js';
import { audio, ensureAudio, sfx } from '../systems/audio.js';
import { voice } from '../systems/voice.js';

const IS_TOUCH = /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent) || 'ontouchstart' in window;

/**
 * UI 场景：独立于游戏相机（zoom=1，纯屏幕坐标）。
 * HUD、虚拟摇杆、升级卡片、Boss 血条、低血量红晕、静音按钮。
 * 答题与诊断报告为 DOM 浮层（index.html #overlay）。
 */
export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  create() {
    const { width, height } = this.scale.gameSize;
    const pad = 14;
    // R19 安全区：触屏设备（刘海屏）HUD 整体下移
    this.topPad = IS_TOUCH ? 22 : 0;
    const top = 7 + this.topPad;

    // 经验条（顶部通栏）
    this.xpBg = this.add.rectangle(width / 2, top, width - 2 * pad, 8, 0x1e293b, 0.9);
    this.xpFill = this.add.rectangle(pad + 1, top, 10, 6, 0xfbbf24).setOrigin(0, 0.5);

    // Boss 血条（经验条下方，有 Boss 时显示）
    this.bossBg = this.add.rectangle(width / 2, top + 17, Math.min(420, width - 60), 10, 0x2a0a12, 0.9).setStrokeStyle(1, 0xef4444, 0.6).setVisible(false);
    this.bossFill = this.add.rectangle(0, top + 17, 10, 6, 0xef4444).setOrigin(0, 0.5).setVisible(false);
    this.bossName = this.add.text(width / 2, top + 31, '', { fontFamily: FONT, fontSize: '11px', color: '#ef4444' }).setOrigin(0.5).setVisible(false);

    // HP 条（左上）
    this.hpBg = this.add.rectangle(pad + 100, top + 16, 200, 18, 0x1e293b, 0.85).setStrokeStyle(1, 0x475569);
    this.hpFill = this.add.rectangle(pad + 1, top + 16, 198, 14, COLORS.hp).setOrigin(0, 0.5);
    this.hpText = this.add
      .text(pad + 100, top + 16, '100/100', { fontFamily: FONT, fontSize: '12px', color: COLORS.uiText })
      .setOrigin(0.5);

    // 击杀/护盾（HP 右侧）
    this.killText = this.add
      .text(pad + 210, top + 16, '☠ 0', { fontFamily: FONT, fontSize: '14px', color: COLORS.uiDim })
      .setOrigin(0, 0.5);

    // R24 连击显示
    this.comboText = this.add
      .text(pad + 290, top + 16, '', { fontFamily: FONT, fontSize: '14px', color: '#fbbf24' })
      .setOrigin(0, 0.5);

    // 等级 + 时间（右上）
    this.levelText = this.add
      .text(width - pad, top, 'Lv.1', { fontFamily: FONT, fontSize: '20px', color: COLORS.accent })
      .setOrigin(1, 0);
    this.timeText = this.add
      .text(width - pad, top + 26, '00:00', { fontFamily: FONT, fontSize: '16px', color: COLORS.uiDim })
      .setOrigin(1, 0);

    // 静音按钮（左上角外侧）
    this.muteBtn = this.add
      .text(pad + 2, 26, audio.muted ? '🔇' : '🔊', { fontSize: '18px' })
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        const m = audio.toggle();
        this.muteBtn.setText(m ? '🔇' : '🔊');
      });

    // 暂停按钮（右上，等级下方；手机必备）
    this.pauseBtn = this.add
      .text(width - pad, pad + 50, '⏸', { fontSize: '20px' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.togglePauseOverlay());

    // 冲刺按钮（右下，手机必备；桌面 Shift/空格）
    this.dashBtn = this.add
      .text(width - pad - 6, height - 86, '💨', { fontSize: '30px', color: '#22d3ee' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.doDash());
    this.dashCdText = this.add
      .text(width - pad - 6, height - 56, '', { fontFamily: FONT, fontSize: '11px', color: COLORS.uiDim })
      .setOrigin(0.5);

    // R16 按钮按压反馈：统一缩放脉冲
    const pressFx = (btn) => {
      btn.on('pointerdown', () => {
        const s = btn.scale;
        btn.setScale(s * 0.85);
        this.tweens.add({ targets: btn, scale: s, duration: 180, ease: 'Back.Out' });
      });
    };
    pressFx(this.muteBtn);
    pressFx(this.pauseBtn);
    pressFx(this.dashBtn);

    // 暂停浮层（隐藏备用）
    this.pauseOverlay = null;

    // 低血量红晕
    this.vignette = this.add.rectangle(width / 2, height / 2, width, height, 0xef4444, 0).setDepth(90);
    // R4 受击红闪层
    this.hurtRect = this.add.rectangle(width / 2, height / 2, width, height, 0xff3333, 0).setDepth(95);

    // 操作提示
    const isTouch = this.sys.game.device.input.touch;
    this.hint = this.add
      .text(width / 2, height - 12, isTouch ? '按住屏幕拖动移动 · 躲避敌人' : 'WASD / 方向键 移动 · 躲避敌人', {
        fontFamily: FONT,
        fontSize: '14px',
        color: COLORS.uiDim,
      })
      .setOrigin(0.5, 1);

    this.levelUpUI = null;
    this._lastW = width;
    this._lastH = height;

    // 虚拟摇杆（触屏 + 桌面键盘统一输入）
    this.joystick = new FloatingJoystick(this);

    // 首次交互解锁音频（浏览器自动播放策略）+ 桌面 ESC 暂停 + Shift/空格冲刺
    this.input.once('pointerdown', ensureAudio);
    this.input.keyboard.once('keydown', ensureAudio);
    this.input.keyboard.on('keydown-ESC', () => this.togglePauseOverlay());
    const dashKey = () => {
      const game = this.scene.get('Game');
      const vec = this.joystick ? this.joystick.getVector() : { x: 0, y: 0 };
      const move = vec.x || vec.y ? vec : { x: 1, y: 0 };
      if (game) game.tryDash(move);
    };
    this.input.keyboard.on('keydown-SHIFT', dashKey);
    this.input.keyboard.on('keydown-SPACE', dashKey);

    this.scale.on(Phaser.Scenes.Events.RESIZE, this.relayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scenes.Events.RESIZE, this.relayout, this)
    );
  }

  relayout() {
    const { width, height } = this.scale.gameSize;
    const pad = 14;
    const top = 7 + this.topPad;
    this.xpBg.setPosition(width / 2, top);
    this.xpBg.setSize(width - 2 * pad, 8);
    this.xpFill.setPosition(pad + 1, top);
    this.bossBg.setPosition(width / 2, top + 17);
    this.bossBg.setSize(Math.min(420, width - 60), 10);
    this.bossFill.y = top + 17;
    this.bossName.setPosition(width / 2, top + 31);
    this.hpBg.setPosition(pad + 100, top + 16);
    this.hpFill.setPosition(pad + 1, top + 16);
    this.hpText.setPosition(pad + 100, top + 16);
    this.killText.setPosition(pad + 210, top + 16);
    this.comboText.setPosition(pad + 290, top + 16);
    this.muteBtn.setPosition(pad + 2, top + 19);
    this.pauseBtn.setPosition(width - pad, top + 43);
    this.dashBtn.setPosition(width - pad - 6, height - 86);
    this.dashCdText.setPosition(width - pad - 6, height - 56);
    this.levelText.setPosition(width - pad, top);
    this.timeText.setPosition(width - pad, top + 26);
    this.vignette.setPosition(width / 2, height / 2);
    this.vignette.setSize(width, height);
    this.hurtRect.setPosition(width / 2, height / 2);
    this.hurtRect.setSize(width, height);
    this.hint.setPosition(width / 2, height - 12);
    this.relayoutLevelUpUI();
  }

  doDash() {
    const game = this.scene.get('Game');
    if (!game || !game.playerState || game.playerState.dead) return;
    const vec = game.player.body.velocity.clone();
    const move = vec.length() > 10
      ? { x: vec.x, y: vec.y }
      : (this.joystick ? this.joystick.getVector() : { x: 1, y: 0 });
    game.tryDash(move);
  }

  /** R4 受击红闪 */
  flashHurt() {
    this.hurtRect.setFillStyle(0xff3333, 0.28).setAlpha(1);
    this.tweens.add({ targets: this.hurtRect, alpha: 0, duration: 260, ease: 'Quad.Out' });
  }

  /** R40 成就 toast：顶部滑入 2.5 秒 */
  showAchievementToast(name, desc) {
    const { width } = this.scale.gameSize;
    const txt = this.add
      .text(width / 2, -40, `🏆 成就解锁：${name} —— ${desc}`, {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#fbbf24',
        backgroundColor: '#0a0e1add',
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5, 0)
      .setDepth(300);
    this.tweens.add({ targets: txt, y: 64, duration: 400, ease: 'Back.Out' });
    this.tweens.add({
      targets: txt,
      y: -50,
      delay: 2400,
      duration: 300,
      onComplete: () => txt.destroy(),
    });
  }

  togglePauseOverlay() {
    const game = this.scene.get('Game');
    if (!game || !game.playerState || game.playerState.dead) return;

    if (this.pauseOverlay) {
      // 恢复
      this.pauseOverlay.destroy();
      this.pauseOverlay = null;
      game.togglePause();
      return;
    }

    const paused = game.togglePause();
    if (!paused) return;

    const { width, height } = this.scale.gameSize;
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x0a0e1a, 0.75);
    const title = this.add
      .text(width / 2, height / 2 - 60, '⏸ 暂停', {
        fontFamily: FONT, fontSize: '40px', color: COLORS.accent,
      })
      .setOrigin(0.5);
    const tip = this.add
      .text(width / 2, height / 2 + 10, '战况已冻结，喘口气', {
        fontFamily: FONT, fontSize: '15px', color: COLORS.uiDim,
      })
      .setOrigin(0.5);
    const btn = this.add
      .text(width / 2, height / 2 + 80, '▶ 继续', {
        fontFamily: FONT, fontSize: '26px', color: '#0a0e1a',
        backgroundColor: COLORS.accent, padding: { x: 30, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.togglePauseOverlay());

    this.pauseOverlay = this.add.container(0, 0, [dim, title, tip, btn]);
  }

  // ---------- 升级选卡：hand=点卡片手选（默认）；voice=看字读音喊字选择 ----------
  buildLevelUpCards(playerState) {
    return drawMixedCards(playerState, drawThreeCards);
  }

  showLevelUp(cards, onPick, mode = 'hand') {
    const { width, height } = this.scale.gameSize;
    const ps = this.scene.get('Game').playerState;
    this._cardMode = mode;
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x0a0e1a, 0.82);
    const title = this.add
      .text(width / 2, height / 2 - 185, mode === 'voice' ? '⬆ 升级！喊出卡片上的字' : '⬆ 升级！点卡片升级', {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#fbbf24',
        stroke: '#78350f',
        strokeThickness: 2,
      })
      .setOrigin(0.5);

    const vertical = width < 620;
    const cardW = vertical ? Math.min(340, width - 40) : Math.min(250, width / 3 - 18);
    const cardH = 200;
    const gap = 18;
    const startX = vertical ? width / 2 : width / 2 - (cardW * 3 + gap * 2) / 2 + cardW / 2;
    const startY = vertical ? height / 2 - 85 : height / 2 - 20;

    const nodes = cards.map((card, i) => {
      const cx = vertical ? width / 2 : startX + i * (cardW + gap);
      const cy = vertical ? startY + i * (cardH + gap) : startY;
      const lvl = ps.skillLevels[card.id] || 0;
      const willMax = lvl + 1 === card.max;
      const borderColor = willMax ? 0xfbbf24 : 0x38bdf8;

      const g = this.add.graphics();
      g.fillStyle(0x111a2e, 0.97);
      g.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 16);
      g.lineStyle(willMax ? 4 : 2, borderColor, 0.95);
      g.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 16);

      // 巨大汉字（认知主体）+ emoji 提示
      const hanzi = this.add
        .text(cx - 10, cy - 18, card.char, {
          fontFamily: FONT,
          fontSize: '84px',
          fontStyle: 'bold',
          color: '#ffe9a3',
          stroke: '#78350f',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      const emoji = this.add
        .text(cx + cardW / 2 - 44, cy - cardH / 2 + 30, card.emoji || '', { fontSize: '34px' })
        .setOrigin(0.5);
      const name = this.add
        .text(cx, cy + 42, `${card.name} ${willMax ? '✦MAX' : `${lvl + 1}/${card.max === Infinity ? '∞' : card.max}`}`, {
          fontFamily: FONT,
          fontSize: '17px',
          color: '#' + borderColor.toString(16).padStart(6, '0'),
        })
        .setOrigin(0.5);
      const desc = this.add
        .text(cx, cy + cardH / 2 - 26, card.desc(lvl), {
          fontFamily: FONT,
          fontSize: '12px',
          color: COLORS.uiText,
          wordWrap: { width: cardW - 28 },
        })
        .setOrigin(0.5, 1);

      const children = [g, hanzi, emoji, name, desc];

      // hand 模式：卡片可点选；voice 模式：无任何触摸目标，只认喊字
      if (mode === 'hand') {
        const hit = this.add
          .rectangle(cx, cy, cardW, cardH, 0xffffff, 0.001)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            sfx.gem();
            this.pickCard(onPick, i);
          });
        children.push(hit);
      }

      return this.add.container(0, 0, children);
    });

    // 卡片交错入场动画
    nodes.forEach((node, i) => {
      node.y = 26;
      node.alpha = 0;
      this.tweens.add({
        targets: node,
        y: 0,
        alpha: 1,
        duration: 340,
        delay: 90 + i * 80,
        ease: 'Back.Out',
      });
    });

    this.levelUpUI = this.add.container(0, 0, [dim, title, ...nodes]);
    this.levelUpUI.cards = cards;
    this.levelUpUI.onPick = onPick;
    this.levelUpUI.mode = mode;

    if (mode === 'voice') {
      // 听写指示条：麦克风状态 + 已听到的内容
      const micY = height / 2 + (vertical ? 265 : 150);
      const mic = this.add
        .text(width / 2 - 130, micY, '🎤', { fontSize: '40px' })
        .setOrigin(0.5);
      const tip = this.add
        .text(width / 2 + 30, micY - 16, '大声读出你想升级的字！', {
          fontFamily: FONT, fontSize: '20px', color: '#4ade80', fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const heard = this.add
        .text(width / 2 + 30, micY + 14, ' ……', {
          fontFamily: FONT, fontSize: '15px', color: '#7dd3fc',
        })
        .setOrigin(0.5);
      this.levelUpUI.add([mic, tip, heard]);
      this._cardMic = mic;
      this._cardHeard = heard;
      this._cardNodes = nodes;
      this._missCount = 0; // 喊错计数：1 次鼓励重读，2 次起进入"跟老师念"带读
      this._hintIdx = 0;   // 带读轮换：把三张卡都带到
      this._asrSession = (this._asrSession || 0) + 1; // 会话令牌：作废旧回调
      this._voicePaused = false;

      // 麦克风图标脉冲
      this.tweens.add({
        targets: mic,
        scale: { from: 1, to: 1.25 },
        alpha: { from: 1, to: 0.6 },
        duration: 700,
        yoyo: true,
        repeat: -1,
      });

      // 点麦克风 = 再说一遍（点的是"开始听"，不是选卡）
      mic.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.startVoicePick());

      if (!voice.asrSupported()) {
        tip.setText('此浏览器不支持语音识别');
        heard.setText('请用 Chrome/Edge/讯飞浏览器打开 · 应急：按 1/2/3 键');
        this.bindCardKeys(onPick);
        return;
      }
      this.unbindCardKeys(); // 语音模式：仅喊字可选
      this.startVoicePick();
    } else {
      // 手选模式：大字提示 + 1/2/3 键也可用
      this._cardMic = null;
      this._cardHeard = null;
      const tip = this.add
        .text(width / 2, height / 2 + (vertical ? 265 : 150), '👆 点一张卡片升级！（键盘 1 / 2 / 3 也行）', {
          fontFamily: FONT, fontSize: '20px', color: '#4ade80', fontStyle: 'bold',
        })
        .setOrigin(0.5);
      this.levelUpUI.add(tip);
      this.unbindCardKeys();
      this.bindCardKeys(onPick);
    }
  }

  /** 启动一轮语音听写：喊出卡片上的字 → 命中即升级；喊错有梯度提示 */
  startVoicePick() {
    if (!this.levelUpUI || !voice.asrSupported()) return;
    // 任何 TTS 还在播（答题解析尾音/提示音）都先等它结束，防止麦克风录到扬声器声音误选
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      clearTimeout(this._asrRetry);
      this._asrRetry = setTimeout(() => this.startVoicePick(), 400);
      return;
    }
    const cards = this.levelUpUI.cards;
    const session = this._asrSession;
    // 跟读提示文字保持显示，直到下一次听到结果
    if (this._cardHeard && !(this._cardHeard.text || '').includes('👉')) this._cardHeard.setText(' 🎤 听……');
    voice.stopListen(this._asrRec);
    this._asrRec = null;
    const ok = voice.listen(
      (texts) => {
        // 中间/最终结果都尝试匹配；命中立即选卡
        if (!this.levelUpUI || session !== this._asrSession) return;
        const hit = voice.matchCards(cards, texts);
        if (this._cardHeard) this._cardHeard.setText(` 听到：${texts[0] || '…'}`);
        if (hit) {
          const idx = cards.indexOf(hit);
          sfx.gem();
          if (this._missCount >= 2) hit.__echoed = true; // 带读后跟读成功：让战斗场景加表扬
          this.pickCard(this.levelUpUI.onPick, idx);
        } else {
          this._onShoutMiss(cards, texts);
        }
      },
      () => {
        // 会话结束：选卡界面还开着且未在带读提示中 → 自动重新聆听
        this._asrRec = null;
        if (session !== this._asrSession) return;
        if (this.levelUpUI && voice.enabled && !this._voicePaused) {
          this._asrRetry = setTimeout(() => {
            if (this.levelUpUI && !this._voicePaused) this.startVoicePick();
          }, 450);
        }
      }
    );
    if (!ok) {
      // 启动失败（权限/占用）：自动重试 3 次，仍失败则提示点话筒手动重试
      this._startFails = (this._startFails || 0) + 1;
      if (this._startFails <= 3) {
        this._asrRetry = setTimeout(() => this.startVoicePick(), 1200);
      } else if (this._cardHeard) {
        this._cardHeard.setText(' 麦克风启动失败，点话筒再试');
      }
    } else {
      this._startFails = 0;
    }
  }

  /** 喊错了：梯度提示（先鼓励重读 → "跟老师念"带字词示范并高亮卡片 → 屡次失败给家长提示） */
  _onShoutMiss(cards, texts) {
    this._missCount += 1;
    const said = (texts && texts[0]) || '';
    if (this._missCount === 1) {
      // 第一次喊错：不直接给答案，引导看卡片重读
      this._pulseCards();
      this._pauseVoicePick();
      const seq1 = this._hintSeq;
      voice.speak('喊的是' + said + '呀。再看看卡片，大声读出来！', {
        onEnd: () => { if (seq1 === this._hintSeq) this._resumeVoicePick(); },
      });
    } else {
      if (this._missCount >= 6 && this._cardHeard) {
        this._cardHeard.setText(' 😊 识别有点难：让孩子靠近麦克风、大声慢一点');
      }
      // 跟读模式（洪恩识字"说"环节范式）：字在词中示范——"山，大山的山"，跟着念即命中
      const hintCard = cards[this._hintIdx % cards.length];
      this._hintIdx += 1;
      this._glowCard(hintCard);
      this._pauseVoicePick();
      if (this._cardHeard) {
        this._cardHeard.setText(` 👉 跟老师念：${hintCard.char}，${hintCard.word || hintCard.char}的${hintCard.char}！`);
      }
      // _hintSeq 令牌：新提示覆盖旧提示时（cancel 会触发旧 onend），旧回调不得提前恢复聆听
      this._hintSeq = (this._hintSeq || 0) + 1;
      const seq = this._hintSeq;
      voice.speak(`跟老师念：${hintCard.char}，${hintCard.word || hintCard.char}的${hintCard.char}！`, {
        onEnd: () => { if (seq === this._hintSeq) this._resumeVoicePick(); },
      });
    }
  }

  /** 暂停聆听（朗读提示期间，防止麦克风录到扬声器声音误选） */
  _pauseVoicePick() {
    this._asrSession += 1; // 作废当前会话回调
    this._hintSeq = (this._hintSeq || 0) + 1; // 作废尚未执行的旧提示 onEnd
    this._voicePaused = true;
    clearTimeout(this._asrRetry);
    voice.stopListen(this._asrRec);
    this._asrRec = null;
  }

  /** 提示朗读完毕，恢复聆听 */
  _resumeVoicePick() {
    if (!this.levelUpUI) return;
    this._voicePaused = false;
    this._asrRetry = setTimeout(() => {
      if (this.levelUpUI && !this._voicePaused) this.startVoicePick();
    }, 500);
  }

  /** 三张卡一起轻晃：吸引小朋友看卡片 */
  _pulseCards() {
    (this._cardNodes || []).forEach((node, i) => {
      this.tweens.add({
        targets: node,
        scale: { from: 1, to: 1.05 },
        duration: 160,
        yoyo: true,
        repeat: 2,
        delay: i * 90,
        ease: 'Sine.InOut',
      });
    });
  }

  /** 单卡高亮闪烁：跟读提示指向的卡 */
  _glowCard(card) {
    const idx = (this.levelUpUI ? this.levelUpUI.cards : []).indexOf(card);
    const node = this._cardNodes && this._cardNodes[idx];
    if (!node) return;
    this.tweens.add({
      targets: node,
      scale: { from: 1, to: 1.09 },
      duration: 240,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.InOut',
    });
  }

  /** 绑定家长辅助键（仅 ASR 不可用环境） */
  bindCardKeys(onPick) {
    this.unbindCardKeys();
    this._cardKeyBinds = ['ONE', 'TWO', 'THREE'].map((k, i) => {
      const h = () => this.pickCard(onPick, i);
      this.input.keyboard.on('keydown-' + k, h);
      return { evt: 'keydown-' + k, h };
    });
  }

  unbindCardKeys() {
    (this._cardKeyBinds || []).forEach(({ evt, h }) => this.input.keyboard.off(evt, h));
    this._cardKeyBinds = [];
  }

  pickCard(onPick, index = 0) {
    if (!this.levelUpUI) return;
    const card = this.levelUpUI.cards[index];
    if (!card) return;
    this._asrSession += 1;
    this._voicePaused = true;
    clearTimeout(this._asrRetry);
    voice.stopListen(this._asrRec);
    this._asrRec = null;
    this.unbindCardKeys();
    this._cardMic = null;
    this._cardHeard = null;
    this._cardNodes = null;
    this.levelUpUI.destroy();
    this.levelUpUI = null;
    onPick(card);
  }

  relayoutLevelUpUI() {
    if (!this.levelUpUI) return;
    const { cards, onPick, mode } = this.levelUpUI;
    this._asrSession += 1;
    this._voicePaused = true;
    clearTimeout(this._asrRetry);
    voice.stopListen(this._asrRec);
    this._asrRec = null;
    this._cardMic = null;
    this._cardHeard = null;
    this._cardNodes = null;
    this.levelUpUI.destroy();
    this.levelUpUI = null;
    this.showLevelUp(cards, onPick, mode || 'hand');
  }

  restart() {
    this.scene.get('Game').scene.restart();
  }

  update() {
    // 尺寸变化时重排
    const { width, height } = this.scale.gameSize;
    if (width !== this._lastW || height !== this._lastH) {
      this._lastW = width;
      this._lastH = height;
      this.relayout();
    }

    const game = this.scene.get('Game');
    if (!game || !game.playerState) return;

    const ps = game.playerState;
    this.hpText.setText(`${Math.max(0, Math.ceil(ps.hp))}/${ps.maxHp}`);
    const ratio = Phaser.Math.Clamp(ps.hp / ps.maxHp, 0, 1);
    // R27 经验条平滑渐变（xp/xpNeed 非有限值时按 0 处理，防止 NaN 宽度把条画没）
    const xpRaw = ps.xpNeed > 0 ? ps.xp / ps.xpNeed : 0;
    const xpRatio = Number.isFinite(xpRaw) ? Phaser.Math.Clamp(xpRaw, 0, 1) : 0;
    this._xpShow = Phaser.Math.Linear(Number.isFinite(this._xpShow) ? this._xpShow : 0, xpRatio, 0.22);
    const xpW = (this.xpBg.width - 2) * this._xpShow;
    this.xpFill.width = Number.isFinite(xpW) ? Math.max(xpW, 3) : 3;
    this.killText.setText(ps.shieldMax > 0 ? `☠ ${ps.kills}  🛡 ${ps.shield}/${ps.shieldMax}` : `☠ ${ps.kills}`);
    this.comboText.setText(game.combo >= 5 && game.comboTimer > 0 ? `🔥 连击 ×${game.combo}` : '');
    this.levelText.setText(`Lv.${ps.level}`);

    const t = Math.floor(game.elapsedMs / 1000);
    this.timeText.setText(
      `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
    );

    // R17 血条平滑渐变（显示值追赶真实值）
    const safeRatio = Number.isFinite(ratio) ? ratio : 0;
    this._hpShow = Phaser.Math.Linear(Number.isFinite(this._hpShow) ? this._hpShow : 1, safeRatio, 0.18);
    const hpW = 198 * this._hpShow;
    this.hpFill.width = Number.isFinite(hpW) ? Math.max(hpW, 2) : 2;

    // Boss 血条：白色残影条（显示受击前血量）+ 红色实条快速跟随
    const boss = game.boss;
    if (boss && boss.active) {
      this.bossBg.setVisible(true);
      this.bossFill.setVisible(true);
      this.bossName.setVisible(true);
      const bw = this.bossBg.width - 2;
      const target = Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1);
      this._bossShow = Phaser.Math.Linear(this._bossShow ?? target, target, 0.12);
      if (!this.bossGhost) {
        this.bossGhost = this.add.rectangle(0, this.bossBg.y, 10, 6, 0xffffff, 0.6).setOrigin(0, 0.5).setVisible(false);
      }
      this.bossGhost.setVisible(true);
      this.bossGhost.setPosition(this.bossBg.x - this.bossBg.width / 2 + 1, this.bossBg.y);
      this.bossGhost.width = Math.max(bw * this._bossShow, 3);
      this.bossFill.setPosition(this.bossBg.x - this.bossBg.width / 2 + 1, this.bossBg.y);
      this.bossFill.width = Math.max(bw * target, 3);
      this.bossName.setText(boss.kind === 'dice' ? '生字大王' : boss.kind === 'sine' ? '拼音魔像' : '笔画巨人');
    } else {
      this.bossBg.setVisible(false);
      this.bossFill.setVisible(false);
      this.bossName.setVisible(false);
      if (this.bossGhost) this.bossGhost.setVisible(false);
      this._bossShow = null;
    }

    // 冲刺冷却显示
    const cd = game.dashCd || 0;
    this.dashCdText.setText(cd > 0 ? (cd / 1000).toFixed(1) + 's' : 'READY');
    this.dashCdText.setColor(cd > 0 ? COLORS.uiDim : '#4ade80');

    // 低血量红晕脉冲
    const hpRatio = ps.hp / ps.maxHp;
    if (!ps.dead && hpRatio < 0.3) {
      const pulse = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(this.time.now / 200));
      this.vignette.setFillStyle(0xef4444, pulse * (1 - hpRatio / 0.3));
    } else {
      this.vignette.setFillStyle(0xef4444, 0);
    }
  }
}
