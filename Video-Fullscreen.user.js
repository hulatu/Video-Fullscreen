// ==UserScript==
// @name         视频网页全屏/画中画 (纯净通用版)
// @namespace    https://github.com/hulatu/Video-Fullscreen
// @version      1.0.2
// @description  利用纯 CSS 算法实现全网通用的网页全屏，不干扰网站原生快捷键，完美解决 B 站/YouTube 遮挡问题
// @author       hulatu
// @match        *://*/*
// @exclude      *://*.w3school.com.cn/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(() => {
    'use strict';

    // ==========================================
    // UI 与核心状态管理
    // ==========================================
    const state = {
        isWebFS: false,
        activeVideo: null,
        activeContainer: null,
        hideTimer: null
    };

    // 注入核心 CSS（底层强制破除遮挡的魔法）
    const injectCSS = () => {
        const style = document.createElement('style');
        style.innerHTML = `
            /* 悬浮按钮 UI */
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
                background: rgba(30, 30, 30, 0.75);
                color: #FFF;
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 6px;
                padding: 6px 14px;
                font-size: 13px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                backdrop-filter: blur(8px);
                transition: all 0.2s ease;
            }
            .mv-btn:hover {
                background: rgba(39, 116, 216, 0.9);
                border-color: rgba(255,255,255,0.5);
            }

            /* --------- 核心全屏算法 CSS --------- */
            body.mv-webfs-active {
                overflow: hidden !important; /* 隐藏浏览器滚动条 */
            }

            /* 容器强制置顶全屏 */
            .mv-webfs-container {
                position: fixed !important;
                top: 0 !important; 
                left: 0 !important;
                width: 100vw !important; 
                height: 100vh !important;
                max-width: 100vw !important; 
                max-height: 100vh !important;
                margin: 0 !important; 
                padding: 0 !important;
                z-index: 2147483647 !important;
                background: #000 !important;
            }

            /* 确保视频本身铺满容器，并保持比例不变形 (解决 YouTube 核心痛点) */
            .mv-webfs-container video {
                width: 100% !important; 
                height: 100% !important;
                object-fit: contain !important; 
            }

            /* 破除所有父级元素的层叠上下文限制 (防止被网站顶部导航栏遮挡) */
            .mv-webfs-ancestor {
                transform: none !important;
                filter: none !important;
                perspective: none !important;
                contain: none !important;
                will-change: auto !important;
                z-index: auto !important; 
            }
        `;
        document.head.appendChild(style);
    };

    // 初始化按钮 DOM
    const initUI = () => {
        const container = document.createElement('div');
        container.id = 'mv-controls-container';
        container.innerHTML = `
            <button id="mv-fs-btn" class="mv-btn">网页全屏 (Esc)</button>
            <button id="mv-pip-btn" class="mv-btn">画中画 (F2)</button>
        `;
        document.body.appendChild(container);

        document.getElementById('mv-fs-btn').addEventListener('click', () => toggleWebFS());
        document.getElementById('mv-pip-btn').addEventListener('click', () => togglePiP());
        return container;
    };
    const uiContainer = (injectCSS(), initUI());

    // ==========================================
    // 逻辑：寻找最适合全屏的“播放器外层容器”
    // ==========================================
    const getPlayerContainer = (video) => {
        if (!video) return null;
        // 优先匹配各大视频网站的播放器主容器（确保全屏后保留进度条等控件）
        const selectors = [
            '.html5-video-player',       // YouTube
            '.bpx-player-container',     // Bilibili
            '.art-video-player',         // 通用 ArtPlayer
            '.dplayer',                  // 通用 DPlayer
            '.txp_player',               // 腾讯视频
            '#flashbox'                  // 爱奇艺等
        ];
        for (let sel of selectors) {
            const el = video.closest(sel);
            if (el) return el;
        }
        // 如果都没匹配到，默认使用视频的直接父级
        return video.parentElement && video.parentElement.tagName !== 'BODY' ? video.parentElement : video;
    };

    // ==========================================
    // 动作：进入与退出网页全屏
    // ==========================================
    function toggleWebFS() {
        if (state.isWebFS) {
            // 退出网页全屏
            if (state.activeContainer) {
                state.activeContainer.classList.remove('mv-webfs-container');
                let parent = state.activeContainer.parentElement;
                while (parent && parent !== document.documentElement) {
                    parent.classList.remove('mv-webfs-ancestor');
                    parent = parent.parentElement;
                }
            }
            document.body.classList.remove('mv-webfs-active');
            state.isWebFS = false;
        } else {
            // 进入网页全屏
            const videoEl = state.activeVideo || document.querySelector('video');
            if (!videoEl) return;

            const container = getPlayerContainer(videoEl);
            if (!container) return;

            // 向上遍历，消除所有父级的遮挡限制
            let parent = container.parentElement;
            while (parent && parent !== document.documentElement) {
                parent.classList.add('mv-webfs-ancestor');
                parent = parent.parentElement;
            }

            container.classList.add('mv-webfs-container');
            document.body.classList.add('mv-webfs-active');
            
            state.activeContainer = container;
            state.isWebFS = true;
        }

        // 强制触发窗口 resize 事件（关键：通知 B站/YouTube 的底层代码重新计算进度条和画面尺寸）
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 50);
    }

    // ==========================================
    // 动作：画中画
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
    // 监听器：安全的快捷键拦截 (完美修复 B站 / YouTube 冲突)
    // ==========================================
    window.addEventListener('keydown', (e) => {
        const isEsc = e.key === 'Escape' || e.keyCode === 27;
        const isF2 = e.key === 'F2' || e.keyCode === 113;

        if (!isEsc && !isF2) return;

        // 判断用户是否正在打字（如发弹幕、写评论）
        const activeEl = document.activeElement;
        const isInput = activeEl && (
            activeEl.tagName === 'INPUT' || 
            activeEl.tagName === 'TEXTAREA' || 
            activeEl.isContentEditable || 
            activeEl.getAttribute('contenteditable') === 'true'
        );

        if (isEsc) {
            // 【核心修复】：如果你并没有通过脚本开启网页全屏，则绝对不拦截 Esc！
            // 这样 B 站和 YouTube 原生的 Esc 功能（如退出自带全屏、关闭搜索框）将完全恢复正常！
            if (!state.isWebFS) return;

            // 如果当前处于脚本的网页全屏状态，则拦截 Esc 并退出全屏
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            toggleWebFS(); 
        }

        if (isF2) {
            if (isInput) return; // 打字时不触发
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            togglePiP();
        }
    }, { capture: true }); // 在最高层捕获事件

    // ==========================================
    // 监听器：鼠标悬浮视频呼出 UI
    // ==========================================
    document.addEventListener('mousemove', (e) => {
        const path = e.composedPath();
        const video = path.find(el => el.tagName === 'VIDEO');

        if (video && video.offsetHeight > 150) {
            state.activeVideo = video;
            const rect = video.getBoundingClientRect();

            // 定位在视频右上角
            uiContainer.style.top = `${Math.max(10, rect.top + 15)}px`;
            uiContainer.style.left = `${Math.max(10, rect.right - uiContainer.offsetWidth - 20)}px`;
            uiContainer.classList.add('mv-show');

            clearTimeout(state.hideTimer);
            state.hideTimer = setTimeout(() => {
                uiContainer.classList.remove('mv-show');
            }, 2500); // 鼠标停止 2.5 秒后隐藏
        }
    });

})();
