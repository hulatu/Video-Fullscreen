// ==UserScript==
// @name         视频网页全屏/画中画 (终极版)
// @namespace    https://github.com/hulatu/Video-Fullscreen
// @version      1.0.0
// @description  完美解决 B 站等界面的遮挡问题...
// @author       hulatu
// @match        *://*/*
// @exclude      *://*.w3school.com.cn/*
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/hulatu/Video-Fullscreen/main/Video-Fullscreen.user.js
// @downloadURL  https://raw.githubusercontent.com/hulatu/Video-Fullscreen/main/Video-Fullscreen.user.js
// ==/UserScript==

(() => {
    'use strict';

    // ==========================================
    // 网站专属规则库 (优先使用各平台原生网页全屏)
    // ==========================================
    const siteRules = [
        {
            host: 'bilibili.com',
            // 兼容 B站普通视频、直播间、番剧区
            webBtn: '.bpx-player-ctrl-web, .bilibili-live-player-video-controller-web-fullscreen-btn-span, .squirtle-video-pagefullscreen, .art-control-fullscreenWeb',
            pipBtn: '.bpx-player-ctrl-pip, .bilibili-live-player-video-controller-pip-btn'
        },
        {
            host: 'youtube.com',
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
            host: 'v.qq.com', // 腾讯视频
            webBtn: '.txp_btn_fake'
        },
        {
            host: 'iqiyi.com', // 爱奇艺
            webBtn: '.iqp-btn-webscreen'
        }
    ];

    // ==========================================
    // UI 控制与状态
    // ==========================================
    const state = {
        isGenericWebFs: false,
        activeVideo: null,
        hideTimer: null
    };

    // 初始化 CSS
    const injectCSS = () => {
        const style = document.createElement('style');
        style.innerHTML = `
            /* 悬浮按钮容器 UI */
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
                background: rgba(39, 169, 216, 0.8);
                color: #FFF;
                border: none;
                border-radius: 4px;
                padding: 6px 12px;
                font-size: 13px;
                font-family: "Microsoft YaHei", sans-serif;
                cursor: pointer;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                backdrop-filter: blur(4px);
                transition: background 0.2s ease;
            }
            .mv-btn:hover {
                background: rgba(39, 116, 216, 1);
            }

            /* 通用全屏方案：核心防遮挡逻辑 */
            body.mv-fullscreen-active {
                overflow: hidden !important;
            }
            /* 将视频容器全屏化 */
            .mv-maximized {
                position: fixed !important;
                top: 0 !important; left: 0 !important;
                width: 100vw !important; height: 100vh !important;
                max-width: none !important; max-height: none !important;
                margin: 0 !important; padding: 0 !important;
                z-index: 2147483647 !important;
                background: #000 !important;
            }
            .mv-maximized video {
                width: 100% !important; height: 100% !important;
                object-fit: contain !important;
            }
            /* 重置所有父级的层叠上下文，并大幅提高层级，彻底盖住侧边栏 */
            .mv-ancestor {
                position: relative !important;
                z-index: 2147483646 !important;
                transform: none !important;
                contain: none !important;
                will-change: auto !important;
                filter: none !important;
                clip-path: none !important;
                perspective: none !important;
            }
        `;
        document.head.appendChild(style);
    };

    // 初始化 UI DOM
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
    // 核心事件：模拟真实的底层鼠标点击
    // 解决部分网站 (如 B 站) .click() 不生效的问题
    // ==========================================
    const triggerNativeEvent = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;

        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(eventType => {
            const event = new MouseEvent(eventType, {
                bubbles: true, cancelable: true, view: window, clientX, clientY
            });
            element.dispatchEvent(event);
        });
        return true;
    };

    // ==========================================
    // 执行网页全屏切换
    // ==========================================
    function toggleWebFullscreen() {
        const currentHost = location.hostname;
        const rule = siteRules.find(r => currentHost.includes(r.host));

        // 1. 尝试触发平台原生网页全屏 (完美无Bug)
        if (rule && rule.webBtn) {
            const btn = document.querySelector(rule.webBtn);
            if (btn && btn.offsetHeight > 0) {
                console.log('[现代网页全屏] 命中原生按钮规则');
                triggerNativeEvent(btn);
                return;
            }
        }

        // 2. 如果没有找到原生按钮，走通用防遮挡全屏方案
        if (state.isGenericWebFs) {
            // 退出通用全屏
            document.body.classList.remove('mv-fullscreen-active');
            if (state.activeVideo) {
                state.activeVideo.classList.remove('mv-maximized');
                let parent = state.activeVideo.parentElement;
                while (parent && parent !== document.documentElement) {
                    parent.classList.remove('mv-ancestor');
                    parent = parent.parentElement;
                }
            }
            state.isGenericWebFs = false;
        } else {
            // 开启通用全屏
            let videoTarget = state.activeVideo || document.querySelector('video');
            if (!videoTarget) return;

            // 寻找最适合放大的容器 (带有控制条的父级元素)
            let container = videoTarget;
            if (container.parentElement && container.parentElement.tagName !== 'BODY') {
                container = container.parentElement;
            }

            // 向上遍历，给所有父级添加层叠穿透 class
            let parent = container.parentElement;
            while (parent && parent !== document.documentElement) {
                parent.classList.add('mv-ancestor');
                parent = parent.parentElement;
            }

            container.classList.add('mv-maximized');
            document.body.classList.add('mv-fullscreen-active');
            state.activeVideo = container;
            state.isGenericWebFs = true;
        }
    }

    // ==========================================
    // 执行画中画切换
    // ==========================================
    async function togglePiP() {
        const currentHost = location.hostname;
        const rule = siteRules.find(r => currentHost.includes(r.host));

        if (rule && rule.pipBtn) {
            const btn = document.querySelector(rule.pipBtn);
            if (btn && btn.offsetHeight > 0) {
                triggerNativeEvent(btn);
                return;
            }
        }

        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else {
            const video = state.activeVideo?.querySelector('video') || document.querySelector('video');
            if (video && video.readyState >= 1) {
                await video.requestPictureInPicture().catch(console.warn);
            }
        }
    }

    // ==========================================
    // 监听器：快捷键控制 (最高优先级拦截)
    // ==========================================
    window.addEventListener('keydown', (e) => {
        // 当焦点在输入框（如弹幕框）时，按下 Esc 会自动失焦，而不是切换屏幕
        const activeTag = document.activeElement?.tagName?.toUpperCase();
        const isInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable;

        if (e.keyCode === 27) { // 27 = Escape
            // 如果处于系统级 F11 全屏状态，让浏览器原生处理退出
            if (document.fullscreenElement) return;

            if (isInput) {
                document.activeElement.blur(); // 只是让输入框失去焦点
                e.preventDefault();
                return;
            }

            e.preventDefault();
            e.stopPropagation(); // 关键！阻止 B站 等播放器原生拦截 Esc 键
            toggleWebFullscreen();
        }

        if (e.keyCode === 113) { // 113 = F2
            if (isInput) return;
            e.preventDefault();
            e.stopPropagation();
            togglePiP();
        }
    }, { capture: true }); // 使用捕获阶段，第一时间抢占事件

    // ==========================================
    // 监听器：悬浮唤出 UI 按钮
    // ==========================================
    document.addEventListener('mousemove', (e) => {
        const path = e.composedPath();
        const video = path.find(el => el.tagName === 'VIDEO');

        if (video && video.offsetHeight > 200) {
            state.activeVideo = video;
            const rect = video.getBoundingClientRect();

            // 将按钮定位在视频右上角
            uiContainer.style.top = `${Math.max(10, rect.top + 10)}px`;
            uiContainer.style.left = `${Math.max(10, rect.right - uiContainer.offsetWidth - 20)}px`;
            uiContainer.classList.add('mv-show');

            // 重新计时隐藏
            clearTimeout(state.hideTimer);
            state.hideTimer = setTimeout(() => {
                uiContainer.classList.remove('mv-show');
            }, 2500); // 鼠标静止 2.5 秒后隐藏按钮
        }
    });

})();
