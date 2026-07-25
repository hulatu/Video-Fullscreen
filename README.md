# 📺 现代视频网页全屏 / 画中画 (油猴脚本)

基于 [视频网页全屏](https://greasyfork.org/zh-CN/scripts/4870-maximize-video) 项目，更新后的一版可用脚本。

彻底解决现代视频网站（特别是 B 站）在网页全屏时的侧边栏、弹幕栏遮挡问题。支持原生无刷新单页应用 (SPA)。

## 🚀 安装方式

👉 **[点击这里一键安装脚本](https://github.com/hulatu/Video-Fullscreen/raw/refs/heads/main/Video-Fullscreen.user.js)** 👈

*(注：需要提前在浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 插件)*

## ✨ 功能特点
1. **原生优先**：自动寻找并触发 B站、YouTube、斗鱼、虎牙等平台的官方网页全屏，100% 无 Bug。
2. **终极防遮挡**：针对没有原生全屏的冷门网站，采用 CSS 层叠穿透算法，强制最高层级，杜绝任何 UI 遮挡。
3. **快捷键支持**：
   - 按 `Esc` 键：进入/退出网页全屏
   - 按 `F2` 键：进入/退出画中画模式
4. **悬浮 UI**：鼠标移入视频区域自动显示磨砂玻璃控制按钮，不按键盘也能轻松操作。
5. **智能屏蔽**：在发弹幕、写评论时，按 `Esc` 不会误触发网页全屏。
