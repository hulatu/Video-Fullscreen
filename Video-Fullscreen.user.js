// ==UserScript==
// @name         视频网页全屏/画中画 (终极修复版)
// @namespace    https://github.com/hulatu/Video-Fullscreen
// @version      1.0.1
// @description  完美解决 B 站、YouTube 等界面的遮挡与快捷键冲突问题
// @author       hulatu
// @match        *://*/*
// @exclude      *://*.w3school.com.cn/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(() => {
    'use strict';

    // ==========================================
    // 网站专属规则库 (仅对有原生“网页全屏”按钮的网站配置)
    // ==========================================
    const siteRules = [
        {
            host: 'bilibili.com',
            // 兼容 B站普通视频、直播间、番剧区
            webBtn: '.bpx-player-ctrl-web, .bilibili-live-player-video-controller-web-fullscreen-btn-span, .squirtle-video-pagefullscreen, .art-control-fullscreenWeb',
            pipBtn: '.bpx-player-ctrl-pip, .bilibili-live-player-video-controller-pip-btn'
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
        // 注意：YouTube 无原生网页全屏，不在此配置，将自动走高质量的通用网页全屏算法
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
                background: rgba(39, 169, 216, 0.85);
                color: #FFF;
                border: none;
                border-radius: 4px;
                padding: 6px 12px;
                font-size: 13px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
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
            /* 重置所有父级的层叠上下文，并大幅提高层级，彻底盖住侧边栏与顶部栏 */
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

    // 寻找最适合放大的播放器外层容器 (避免丢掉控制条)
    const getBestContainer = (video) => {
        if (!video) return null;
        // 优先寻找常见的播放器外层 DOM
        const playerWrapper = video.closest('.html5-video-player, .bpx-player-container, .art-video-player, .player-container, [id*="player"]');
        if (playerWrapper) return playerWrapper;

        let container = video;
        if (container.parentElement && container.parentElement.tagName !== 'BODY') {
            container = container.parentElement;
        }
        return container;
    };

    // ==========================================
    // 执行网页全屏切换
    // ==========================================
    function toggleWebFullscreen() {
        const currentHost = location.hostname;
        const rule = siteRules.find(r => currentHost.includes(r.host));

        // 1. 尝试触发平台原生网页全屏 (对 B 站等有效)
        if (rule && rule.webBtn) {
            const btn = document.querySelector(rule.webBtn);
            if (btn && btn.offsetHeight > 0) {
                triggerNativeEvent(btn);
                return;
            }
        }

        // 2. 通用防遮挡网页全屏方案 (完美适用于 YouTube 等)
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
            const videoEl = state.activeVideo || document.querySelector('video');
            if (!videoEl) return;

            const container = getBestContainer(videoEl);
            if (!container) return;

            // 向上遍历，消除层叠上下文限制
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

        // 强制触发窗口 resize 事件，通知 YouTube/B站 等播放器重新计算尺寸，防止画面拉伸异常
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 100);
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
            const video = (state.activeVideo?.tagName === 'VIDEO' ? state.activeVideo : state.activeVideo?.querySelector('video')) || document.querySelector('video');
            if (video && video.readyState >= 1) {
                await video.requestPictureInPicture().catch(console.warn);
            }
        }
    }

    // ==========================================
    // 监听器：快捷键控制 (深度拦截)
    // ==========================================
    window.addEventListener('keydown', (e) => {
        const isEsc = e.key === 'Escape' || e.keyCode === 27;
        const isF2 = e.key === 'F2' || e.keyCode === 113;

        if (!isEsc && !isF2) return;

        // 检查当前焦点是否在输入框（如 YouTube 评论区、搜索框等）
        const activeEl = document.activeElement;
        const activeTag = activeEl?.tagName?.toUpperCase();
        const isInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeEl?.isContentEditable || activeEl?.getAttribute('contenteditable') === 'true';

        if (isEsc) {
            // 如果处于系统/浏览器原生全屏状态 (F11/全屏)，不干预，让浏览器自行处理
            if (document.fullscreenElement) return;

            if (isInput) {
                activeEl.blur(); // 仅让输入框失去焦点
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return;
            }

            // 彻底阻止网站原生脚本抢先拦截 Esc 键
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
    }, { capture: true }); // 在捕获阶段第一时间强行抢占事件

    // ==========================================
    // 监听器：悬浮唤出 UI 按钮
    // ==========================================
    document.addEventListener('mousemove', (e) => {
        const path = e.composedPath();
        const video = path.find(el => el.tagName === 'VIDEO');

        if (video && video.offsetHeight > 150) {
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
            }, 2500);
        }
    });

})();
