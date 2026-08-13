# 发布与线上地址

作业提交用的 Release 与公网域名如下。

| 项 | 链接 |
|----|------|
| GitHub Release | https://github.com/shuanghuaaa/Coding-Agent-Harness/releases#release-v1.0.0 |
| 线上 WebUI | https://coding-agent-harness.zeabur.app |
| 健康检查 | https://coding-agent-harness.zeabur.app/health |

- **Release：** `v1.0.0`，对应仓库 `master` 上的发布页（格式与作业示例 `.../releases#release-<tag>` 一致）。
- **域名：** Zeabur 公网地址，浏览器打开即为 WebUI。`/health` 正常时返回 `{"status":"ok"}`。
- **机房：** 实例在德国节点。国内校园网访问不稳定时，先打开健康检查，或按 README 用 Docker / 本地 `npm run dev` 复现。
