import Phaser from 'phaser';
import { buildPlaceholderTextures } from '../systems/textures.js';

/** 启动场景：生成占位纹理 → 直接进标题（以后这里加载用户素材） */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // 后续在此加载 public/assets/ 手绘素材与音频，同名覆盖占位纹理
  }

  create() {
    buildPlaceholderTextures(this);
    this.scene.start('Title');
  }
}
