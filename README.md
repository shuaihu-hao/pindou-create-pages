# 拼豆图纸生成器

一个运行在浏览器里的拼豆图纸生成工具。上传图片后，可以选择拼豆尺寸和还原模式，生成带色号、色块和用量统计的拼豆图纸。

## 在线访问

GitHub Pages:

https://shuaihu-hao.github.io/pindou-create-pages/

## 功能

- 支持上传 PNG、JPG、WEBP 图片
- 支持 25*25、50*50、100*100 常用拼豆尺寸
- 支持自定义拼豆宽高，最高 100*100
- 支持柔和、均衡、细节三种还原模式
- 自动生成拼豆预览图和可下载图纸
- 远程接口不可用时，会使用本地算法兜底生成

## 文件结构

```text
.
├── index.html       # 页面结构
├── styles.css       # 页面样式
├── app.js           # 交互和拼豆图纸生成逻辑
└── mard-colors.js   # 拼豆颜色表
```

## 本地运行

这个项目是纯静态页面，可以直接用浏览器打开 `index.html`。

也可以在项目目录启动一个本地静态服务器：

```bash
python3 -m http.server 8000
```

然后访问：

```text
http://localhost:8000
```

## 部署

项目通过 GitHub Pages 部署，发布源为 `main` 分支根目录。

推送到 `main` 后，GitHub Pages 会自动更新线上页面。
