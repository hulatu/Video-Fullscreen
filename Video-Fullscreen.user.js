// ==UserScript==
// @name         视频网页全屏 / 画中画
// @namespace    https://github.com/hulatu/Video-Fullscreen
// @version      2.1.0
// @description  按 Esc 一键网页全屏（优先触发 B站 / YouTube / 斗鱼 / 虎牙 / 腾讯视频 / 爱奇艺 的原生按钮，其余站点走 CSS 兜底），按 F2 无边框画中画；鼠标移到视频上会在右上角浮出两个按钮
// @author       hulatu
// @homepageURL  https://github.com/hulatu/Video-Fullscreen
// @supportURL   https://github.com/hulatu/Video-Fullscreen/issues
// @updateURL    https://raw.githubusercontent.com/hulatu/Video-Fullscreen/main/Video-Fullscreen.user.js
// @downloadURL  https://raw.githubusercontent.com/hulatu/Video-Fullscreen/main/Video-Fullscreen.user.js
// @match        *://*/*
// @exclude      *://*.w3school.com.cn/*
// @license      MIT
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  // 同一个页面只跑一次（部分站点会重复注入）
  if (window.__mvfsLoaded) return;
  window.__mvfsLoaded = true;

  /* ================================================================
     可调项
     ================================================================ */
  const CFG = {
    uiHideDelay:  2500,   // 鼠标离开视频后多久收起按钮（ms）
    minVideoArea: 0.15,   // 视频至少要占视口 15% 才认作「在看视频」，防止误伤页面上小广告视频
    minVideoSide: 150,    // 视频任一边小于这个值就不算（px）
    zIndex:       2147483000  // 不用 2147483647，给站点自己的弹层留一格
  };

  /* ================================================================
     站点规则：优先点站点自己的「网页全屏 / 影院模式」按钮
     —— 想加新站点，照着下面加一行 { host, webBtn } 就行，
        host 用 includes 匹配，webBtn 可以是逗号分隔的多个选择器
     ================================================================ */
  const siteRules = [
    {
      host: 'bilibili.com',
      // 普通视频 / 番剧 / 直播 三种播放器的网页全屏按钮
      webBtn: '.bpx-player-ctrl-web, .squirtle-video-pagefullscreen, .bilibili-live-player-video-controller-web-fullscreen-btn-span'
    },
    { host: 'youtube.com', webBtn: '.ytp-size-button' },          // 影院模式
    { host: 'douyu.com',   webBtn: 'div[title="网页全屏"], .layout-Player-toolbar-webFull' },
    { host: 'huya.com',    webBtn: '.player-fullpage-btn' },
    { host: 'v.qq.com',    webBtn: '.txp_btn_fake' },
    { host: 'iqiyi.com',   webBtn: '.iqp-btn-webscreen' }
  ];

  /* ================================================================
     状态
     ================================================================ */
  const state = {
    video: null,        // 最近一次鼠标停留的视频
    hideTimer: 0,
    hostWidth: 0,       // 缓存按钮条宽度，避免每次 mousemove 都读 offsetWidth（会强制重排）
    fallback: false     // 是否处于 CSS 兜底全屏
  };

  // 优先用鼠标停过的那个；它可能已经被 SPA 换页摘掉了，那就重新找
  function currentVideo() {
    return bigEnough(state.video) ? state.video : mainVideo();
  }

  /* ================================================================
     工具
     ================================================================ */
  const isTyping = (el) => !!el && (
    el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
  );

  // 视频在视口里的可见面积（被裁掉的部分不算）
  function visibleArea(el) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return 0;
    const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    return Math.max(0, w) * Math.max(0, h);
  }

  // 「这个视频值得接管」的统一判定：够大、没被裁掉、且确实在视口里
  // —— 按钮浮出、Esc 兜底、画中画 三处必须用同一把尺子，
  //    否则会出现「按钮出来了但按 Esc 没反应」这种自相矛盾
  function bigEnough(v) {
    if (!v || !v.isConnected) return false;
    if (v.offsetWidth < CFG.minVideoSide || v.offsetHeight < CFG.minVideoSide) return false;
    const area = visibleArea(v);
    return area / Math.max(1, innerWidth * innerHeight) >= CFG.minVideoArea;
  }

  // 页面上最大的那个视频；不够大就当作「这页没有在看的视频」
  function mainVideo() {
    let best = null;
    let bestArea = 0;
    for (const v of document.querySelectorAll('video')) {
      const a = visibleArea(v);
      if (a > bestArea) { bestArea = a; best = v; }
    }
    return bigEnough(best) ? best : null;
  }

  // 当前站点的原生全屏按钮（优先可见的那个）
  function nativeBtn() {
    const rule = siteRules.find((r) => location.hostname.includes(r.host));
    if (!rule) return null;
    const btns = document.querySelectorAll(rule.webBtn);
    if (!btns.length) return null;
    return Array.from(btns).find((b) => b.offsetWidth > 0 && b.offsetHeight > 0) || btns[0];
  }

  /* ================================================================
     注入：兜底全屏的样式（必须挂在页面文档上，不能进 Shadow DOM）
     ================================================================ */
  const PAGE_CSS = `
    body.mv-fallback-active { overflow: hidden !important; }
    .mv-fallback-fs {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: ${CFG.zIndex} !important;
      background: #000 !important;
      /* 全屏的往往就是 video 自己，不写这一条会按 fill 拉变形（16:9 塞进 16:10 会纵向拉伸） */
      object-fit: contain !important;
    }
    .mv-fallback-fs video {
      object-fit: contain !important;
      width: 100% !important;
      height: 100% !important;
    }
    .mv-fallback-ancestor {
      transform: none !important;
      z-index: ${CFG.zIndex - 1} !important;
    }
  `;

  function injectPageCSS() {
    if (document.getElementById('mvfs-page-style')) return;
    const style = document.createElement('style');
    style.id = 'mvfs-page-style';
    style.textContent = PAGE_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ================================================================
     UI：按钮条 + 提示气泡，都放进 Shadow DOM
     —— 站点自己的 CSS 再怎么激进也影响不到这里
     ================================================================ */
  const UI_CSS = `
    :host { all: initial; }
    .bar {
      display: flex;
      gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", Roboto, sans-serif;
    }
    button {
      all: unset;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 13px;
      border-radius: 7px;
      background: rgba(28, 28, 30, .82);
      color: #fff;
      font-size: 13px;
      line-height: 1;
      cursor: pointer;
      border: 1px solid rgba(255, 255, 255, .18);
      box-shadow: 0 4px 14px rgba(0, 0, 0, .35);
      -webkit-backdrop-filter: blur(10px);
      backdrop-filter: blur(10px);
      transition: background .18s ease, border-color .18s ease, transform .12s ease;
    }
    button:hover { background: rgba(39, 116, 216, .95); border-color: rgba(255, 255, 255, .45); }
    button:active { transform: scale(.97); }
    button:focus-visible { outline: 2px solid #4c9aff; outline-offset: 2px; }
    .ico { font-size: 14px; line-height: 1; }
  `;

  const host = document.createElement('div');
  host.id = 'mvfs-ui';
  Object.assign(host.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    zIndex: String(CFG.zIndex),
    opacity: '0',
    visibility: 'hidden',
    transition: 'opacity .22s ease, visibility .22s ease',
    pointerEvents: 'none'
  });

  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>${UI_CSS}</style>
    <div class="bar">
      <button type="button" data-act="fs" title="网页全屏 / 退出（Esc）"><span class="ico">⛶</span>网页全屏</button>
      <button type="button" data-act="pip" title="画中画 / 退出（F2）"><span class="ico">◱</span>画中画</button>
    </div>
  `;

  const fsBtn = root.querySelector('[data-act="fs"]');
  const pipBtn = root.querySelector('[data-act="pip"]');

  /* ---------------- 提示气泡 ---------------- */
  const toastHost = document.createElement('div');
  toastHost.id = 'mvfs-toast';
  Object.assign(toastHost.style, {
    position: 'fixed',
    left: '50%',
    bottom: '56px',
    transform: 'translateX(-50%) translateY(8px)',
    zIndex: String(CFG.zIndex),
    opacity: '0',
    visibility: 'hidden',
    transition: 'opacity .2s ease, transform .2s ease, visibility .2s ease',
    pointerEvents: 'none'
  });

  const tRoot = toastHost.attachShadow({ mode: 'open' });
  tRoot.innerHTML = `
    <style>
      :host { all: initial; }
      .t {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", Roboto, sans-serif;
        font-size: 13px;
        line-height: 1;
        color: #fff;
        background: rgba(28, 28, 30, .88);
        border: 1px solid rgba(255, 255, 255, .16);
        border-radius: 999px;
        padding: 10px 16px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, .4);
        -webkit-backdrop-filter: blur(10px);
        backdrop-filter: blur(10px);
        white-space: nowrap;
      }
    </style>
    <div class="t"></div>
  `;

  const toastText = tRoot.querySelector('.t');
  let toastTimer = 0;

  function toast(msg) {
    mountUI();
    toastText.textContent = msg;
    toastHost.style.opacity = '1';
    toastHost.style.visibility = 'visible';
    toastHost.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastHost.style.opacity = '0';
      toastHost.style.visibility = 'hidden';
      toastHost.style.transform = 'translateX(-50%) translateY(8px)';
    }, 1600);
  }

  function mountUI() {
    if (!document.body) return;
    if (!host.isConnected) document.body.appendChild(host);
    if (!toastHost.isConnected) document.body.appendChild(toastHost);
  }

  /* ================================================================
     按钮条定位
     ================================================================ */
  function place(video) {
    const r = video.getBoundingClientRect();
    if (!state.hostWidth) state.hostWidth = host.offsetWidth || 0;
    host.style.top = `${Math.max(10, r.top + 14)}px`;
    host.style.left = `${Math.max(10, r.right - state.hostWidth - 20)}px`;
  }

  function showBar(video) {
    mountUI();
    place(video);
    host.style.opacity = '1';
    host.style.visibility = 'visible';
    host.style.pointerEvents = 'auto';
    clearTimeout(state.hideTimer);
    state.hideTimer = setTimeout(hideBar, CFG.uiHideDelay);
  }

  function hideBar() {
    host.style.opacity = '0';
    host.style.visibility = 'hidden';
    host.style.pointerEvents = 'none';
  }

  /* ================================================================
     核心动作 1：网页全屏
     ================================================================ */
  function clearFallback() {
    document.body.classList.remove('mv-fallback-active');
    // 不靠记着「是哪个 video」——SPA 换页可能已经把整个播放器换掉了，
    // 直接按 class 扫一遍，永远不会漏掉残留的锁滚动
    document.querySelectorAll('.mv-fallback-fs').forEach((el) => el.classList.remove('mv-fallback-fs'));
    document.querySelectorAll('.mv-fallback-ancestor').forEach((el) => el.classList.remove('mv-fallback-ancestor'));
    state.fallback = false;
  }

  function toggleFallback(video) {
    injectPageCSS();
    if (state.fallback) {
      clearFallback();
      return;
    }
    let p = video.parentElement;
    while (p && p !== document.documentElement) {
      p.classList.add('mv-fallback-ancestor');
      p = p.parentElement;
    }
    video.classList.add('mv-fallback-fs');
    document.body.classList.add('mv-fallback-active');
    state.fallback = true;
  }

  // 返回 true = 这次按键确实做了事（外部才 preventDefault）
  function doWebFullscreen() {
    const btn = nativeBtn();
    if (btn) {
      btn.click();
      toast('已切换网页全屏');
      return true;
    }
    const video = currentVideo();
    if (!video) return false;
    toggleFallback(video);
    toast(state.fallback ? '已进入网页全屏' : '已退出网页全屏');
    return true;
  }

  /* ================================================================
     核心动作 2：画中画
     ================================================================ */
  function setPipLabel(on) {
    pipBtn.innerHTML = `<span class="ico">◱</span>${on ? '退出画中画' : '画中画'}`;
  }

  async function doPiP() {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => {});
      return true;
    }
    const video = currentVideo();
    if (!video) return false;

    if (!document.pictureInPictureEnabled || video.disablePictureInPicture) {
      toast('这个视频不支持画中画');
      return true;
    }
    try {
      if (video.readyState < 1) {
        // 还没开始加载就点，浏览器会直接拒；先试着播一下
        await video.play().catch(() => {});
      }
      await video.requestPictureInPicture();
    } catch (err) {
      toast(`进入画中画失败${err && err.name ? '：' + err.name : ''}`);
    }
    return true;
  }

  /* ================================================================
     监听：鼠标停在视频上才浮出按钮
     —— 用 composedPath 才能抓到 Shadow DOM 里的视频；
        节流 80ms，别让每次 mousemove 都触发一次重排
     ================================================================ */
  let lastMove = 0;

  document.addEventListener('mousemove', (e) => {
    const now = performance.now();
    if (now - lastMove < 80) return;

    const path = e.composedPath();

    // 鼠标停在按钮条自己身上：续命，别让它在你正要点的瞬间消失。
    // 这里用坐标判定而不是 path.includes(host)——document 层的监听拿到的
    // composedPath 里没有 Shadow 内部节点，靠 path 判断会永远失效。
    if (host.style.visibility === 'visible') {
      const b = host.getBoundingClientRect();
      if (e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom) {
        lastMove = now;
        clearTimeout(state.hideTimer);
        state.hideTimer = setTimeout(hideBar, CFG.uiHideDelay);
        return;
      }
    }

    const video = path.find((el) => el.tagName === 'VIDEO');
    if (!video || !bigEnough(video)) return;

    lastMove = now;
    state.video = video;
    showBar(video);
  }, { passive: true });

  // 滚动 / 缩放时按钮会跟丢，重新贴一次（不重置自动隐藏的计时）
  addEventListener('scroll', () => {
    if (state.video && host.style.visibility === 'visible') place(state.video);
  }, { passive: true });

  addEventListener('resize', () => {
    state.hostWidth = 0;
    if (state.video && host.style.visibility === 'visible') place(state.video);
  }, { passive: true });

  /* ================================================================
     监听：快捷键
     ================================================================ */
  addEventListener('keydown', (e) => {
    const isEsc = e.key === 'Escape' || e.keyCode === 27;
    const isF2 = e.key === 'F2' || e.keyCode === 113;
    if (!isEsc && !isF2) return;

    // 在输入框 / 可编辑区域里：完全不插手，Esc 交给站点自己处理
    // （以前这里是「blur 掉输入框再吞掉按键」，会在写评论时莫名其妙丢失焦点）
    if (isTyping(document.activeElement)) return;

    if (isEsc) {
      // 系统级全屏（F11 / video.requestFullscreen）交给浏览器自己退
      if (document.fullscreenElement) return;
      // 没有原生按钮、页面上也没有像样的视频 → 完全不插手，让站点自己处理 Esc
      if (!doWebFullscreen()) return;
    } else {
      if (!doPiP()) return;
    }

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, { capture: true });

  /* ================================================================
     监听：画中画状态 → 按钮文案跟着变
     ================================================================ */
  document.addEventListener('enterpictureinpicture', () => setPipLabel(true));
  document.addEventListener('leavepictureinpicture', () => setPipLabel(false));

  /* ================================================================
     监听：进/出系统全屏时把按钮收起来
     ================================================================ */
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) hideBar();
  });

  /* ================================================================
     启动
     —— 故意「什么都不做」：UI 和样式都在第一次真正用到时才插进来。
        绝大多数页面没有视频，不该白塞两个 div + 一段 style 进去。
     ================================================================ */

  // 点按钮（Shadow DOM 内的事件不会冒泡到页面，得在这里接）
  fsBtn.addEventListener('click', () => doWebFullscreen());
  pipBtn.addEventListener('click', () => doPiP());
})();
