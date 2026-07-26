// ==UserScript==
// @name         视频网页全屏/画中画
// @namespace    https://github.com/hulatu/Video-Fullscreen
// @version      2.0.0
// @description  完美解决 B 站等界面的遮挡问题...
// @author       hulatu
// @match        :///*
// @exclude      ://.w3school.com.cn/*
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/hulatu/Video-Fullscreen/main/Video-Fullscreen.user.js
// @downloadURL  https://raw.githubusercontent.com/hulatu/Video-Fullscreen/main/Video-Fullscreen.user.js
// ==/UserScript==

(() => {
    'use strict';

    // ==========================================
    // 网站专属规则库：精确映射各网站的原生按钮
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
        isGenericWebFS: false // 仅用于没有原生按钮的冷门网站
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
            /* 备用强制全屏方案 */
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

        if (rule && rule.webBtn) {
            const btns = document.querySelectorAll(rule.webBtn);
            // 【核心修复】：优先找可见的按钮。如果全都被隐藏了（比如 YouTube 控制条自动隐藏时），则强行取第一个按钮！
            const btn = Array.from(btns).find(b => b.offsetWidth > 0 && b.offsetHeight > 0) || btns[0];
            
            if (btn) {
                btn.click(); // 直接触发原生点击
                return;
            }
        }

        // ================= 下方为冷门网站的降级备用方案 =================
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
            await document.exitPictureInPicture().catch(console.warn);
        } else {
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

        const activeEl = document.activeElement;
        const isInput = activeEl && (
            activeEl.tagName === 'INPUT' || 
            activeEl.tagName === 'TEXTAREA' || 
            activeEl.isContentEditable
        );

        if (isEsc) {
            // 如果用户在系统级全屏(F11)下，让浏览器自然退出，不干预
            if (document.fullscreenElement) return;

            if (isInput) {
                activeEl.blur(); 
                e.preventDefault();
                return;
            }

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            toggleWebFullscreen();
        }

        if (isF2) {
            if (isInput) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            togglePiP();
        }
    }, { capture: true });

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
