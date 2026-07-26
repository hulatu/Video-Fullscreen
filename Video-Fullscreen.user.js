// ==UserScript==
// @name         视频网页全屏/画中画 (原生丝滑版)
// @namespace    https://github.com/hulatu/Video-Fullscreen
// @version      2.0.0
// @description  按 Esc 智能切换 B站网页全屏 / YouTube 影院模式；按 F2 切换无边框画中画。
// @author       hulatu
// @match        *://*/*
// @exclude      *://*.w3school.com.cn/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(() => {
    'use strict';

    // ==========================================
    // 网站专属规则库：精确映射各网站的“网页全屏/影院模式”按钮
    // ==========================================
    const siteRules = [
        {
            host: 'bilibili.com',
            // B站：网页全屏按钮 (兼容普通视频、番剧、直播)
            webBtn: '.bpx-player-ctrl-web, .squirtle-video-pagefullscreen, .bilibili-live-player-video-controller-web-fullscreen-btn-span'
        },
        {
            host: 'youtube.com',
            // YouTube：影院模式 (Theater Mode) 按钮
            webBtn: '.ytp-size-button'
        },
        {
            host: 'douyu.com',
            webBtn: 'div[title="网页全屏"], .layout-Player-toolbar-webFull'
        },
        {
            host: 'huya.com',
            webBtn: '.player-fullpage-btn'
        },
        {
            host: 'v.qq.com',
            webBtn: '.txp_btn_fake'
        },
        {
            host: 'iqiyi.com',
            webBtn: '.iqp-btn-webscreen'
        }
    ];

    // ==========================================
    // UI 控制与状态
    // ==========================================
    const state = {
        activeVideo: null,
        hideTimer: null,
        isGenericWebFS: false // 仅用于没有原生按钮的冷门网站的降级方案
    };

    const injectCSS = () => {
        const style = document.createElement('style');
        style.innerHTML = `
            #mv-controls-container {
                position: fixed;
                z-index: 2147483647;
                display: flex;
                gap: 8px;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.3s ease, visibility 0.3s ease;
                pointer-events: none;
            }
            #mv-controls-container.mv-show {
                opacity: 1;
                visibility: visible;
                pointer-events: auto;
            }
            .mv-btn {
                background: rgba(40, 40, 40, 0.85);
                color: #FFF;
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 6px;
                padding: 6px 14px;
                font-size: 13px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                cursor: pointer;
                box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                backdrop-filter: blur(5px);
                transition: all 0.2s ease;
            }
            .mv-btn:hover {
                background: rgba(39, 116, 216, 0.95);
                border-color: rgba(255,255,255,0.4);
            }
            /* 通用全屏备用方案 (仅冷门网站触发) */
            body.mv-fallback-active { overflow: hidden !important; }
            .mv-fallback-fs {
                position: fixed !important; top: 0 !important; left: 0 !important;
                width: 100vw !important; height: 100vh !important;
                z-index: 2147483647 !important; background: #000 !important;
            }
            .mv-fallback-fs video { object-fit: contain !important; width: 100% !important; height: 100% !important; }
            .mv-fallback-ancestor { transform: none !important; z-index: 2147483646 !important; }
        `;
        document.head.appendChild(style);
    };

    const initUI = () => {
        const container = document.createElement('div');
        container.id = 'mv-controls-container';
        container.innerHTML = `
            <button id="mv-fs-btn" class="mv-btn">网页全屏 (Esc)</button>
            <button id="mv-pip-btn" class="mv-btn">画中画 (F2)</button>
        `;
        document.body.appendChild(container);
        document.getElementById('mv-fs-btn').addEventListener('click', toggleWebFullscreen);
        document.getElementById('mv-pip-btn').addEventListener('click', togglePiP);
        return container;
    };
    const uiContainer = (injectCSS(), initUI());

    // ==========================================
    // 核心动作 1：智能切换网页全屏 / 影院模式
    // ==========================================
    function toggleWebFullscreen() {
        const currentHost = location.hostname;
        const rule = siteRules.find(r => currentHost.includes(r.host));

        // 优先：智能寻找当前网站的原生按钮并模拟点击 (完美兼容 B站、YouTube 等)
        if (rule && rule.webBtn) {
            const btn = document.querySelector(rule.webBtn);
            if (btn && btn.offsetHeight > 0) {
                // 原生 DOM 点击
                btn.click(); 
                return;
            }
        }

        // 备用：针对冷门网站的强制 CSS 全屏方案
        const video = state.activeVideo || document.querySelector('video');
        if (!video) return;
        
        if (state.isGenericWebFS) {
            document.body.classList.remove('mv-fallback-active');
            video.classList.remove('mv-fallback-fs');
            let parent = video.parentElement;
            while (parent && parent !== document.documentElement) {
                parent.classList.remove('mv-fallback-ancestor');
                parent = parent.parentElement;
            }
            state.isGenericWebFS = false;
        } else {
            let parent = video.parentElement;
            while (parent && parent !== document.documentElement) {
                parent.classList.add('mv-fallback-ancestor');
                parent = parent.parentElement;
            }
            video.classList.add('mv-fallback-fs');
            document.body.classList.add('mv-fallback-active');
            state.isGenericWebFS = true;
        }
    }

    // ==========================================
    // 核心动作 2：纯净无边框画中画 (HTML5 原生 API)
    // ==========================================
    async function togglePiP() {
        if (document.pictureInPictureElement) {
            // 如果已经在画中画，则退出
            await document.exitPictureInPicture().catch(console.warn);
        } else {
            // 如果不在画中画，则进入
            const video = state.activeVideo || document.querySelector('video');
            if (video && video.readyState >= 1) {
                await video.requestPictureInPicture().catch(console.warn);
            }
        }
    }

    // ==========================================
    // 监听器：快捷键控制 (精准拦截)
    // ==========================================
    window.addEventListener('keydown', (e) => {
        const isEsc = e.key === 'Escape' || e.keyCode === 27;
        const isF2 = e.key === 'F2' || e.keyCode === 113;

        if (!isEsc && !isF2) return;

        // 检查当前是否在输入框打字（如 YouTube 搜索栏、B站弹幕框）
        const activeEl = document.activeElement;
        const isInput = activeEl && (
            activeEl.tagName === 'INPUT' || 
            activeEl.tagName === 'TEXTAREA' || 
            activeEl.isContentEditable
        );

        if (isEsc) {
            // 如果用户在系统级全屏(F11)下，让浏览器自然退出，不干预
            if (document.fullscreenElement) return;

            // 如果在打字，只让输入框失焦，不切换影院模式
            if (isInput) {
                activeEl.blur(); 
                e.preventDefault();
                return;
            }

            // 拦截 Esc，执行网页全屏/影院模式切换
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            toggleWebFullscreen();
        }

        if (isF2) {
            if (isInput) return; // 打字时不干预 F2
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            togglePiP();
        }
    }, { capture: true }); // 使用 capture 保证最高优先级

    // ==========================================
    // 监听器：悬浮按钮 UI 显示
    // ==========================================
    document.addEventListener('mousemove', (e) => {
        const path = e.composedPath();
        const video = path.find(el => el.tagName === 'VIDEO');

        if (video && video.offsetHeight > 150) {
            state.activeVideo = video;
            const rect = video.getBoundingClientRect();

            uiContainer.style.top = `${Math.max(10, rect.top + 15)}px`;
            uiContainer.style.left = `${Math.max(10, rect.right - uiContainer.offsetWidth - 20)}px`;
            uiContainer.classList.add('mv-show');

            clearTimeout(state.hideTimer);
            state.hideTimer = setTimeout(() => {
                uiContainer.classList.remove('mv-show');
            }, 2500);
        }
    });

})();
