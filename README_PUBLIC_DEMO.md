# AI 用户反馈分析助手公开演示版

这个目录是公开静态展示版，不是私有操作版。

## 版本定位

- 展示完整网页界面，包括 AI 分析台、概览、产品对比、问题分布、问题优化池、卖点池、证据库、总结报告和字段说明。
- 默认展示益生菌 264 条样本数据。
- 访客可以浏览看板、筛选、搜索证据。
- 访客不能上传新数据、不能填写 API Key、不能调用 Gemini、不能做单条评论分析、不能下载分析结果。

## 和私有操作版的关系

私有操作版仍是：

- `outputs/gemini_feedback_analysis/web_mvp/`

固定回退快照为：

- `outputs/gemini_feedback_analysis/version_snapshots/web_mvp_v3_local_final_2026-07-04/`

公开演示版基于私有版复制而来，只在公开目录中禁用操作能力，不修改私有操作版。

## 部署建议

该目录可以作为静态网页部署到 GitHub Pages、Netlify、Vercel 或 Cloudflare Pages。

公开部署时不要把任何真实 API Key 写入源码或页面。
