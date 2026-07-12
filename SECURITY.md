# 安全策略

## 支持版本

安全修复优先应用于 `main` 分支和最新发布版本。较旧版本可能不会继续获得修复。

## 报告安全问题

请不要在公开 Issue、Pull Request 或讨论中发布 API Key、Access Token、数据库连接字符串、Webhook 签名密钥或完整生产响应。

请通过 GitHub Security Advisories 提交私密报告：

<https://github.com/yigehaozi/relay-status-monitor/security/advisories/new>

报告应包含：受影响版本、复现步骤、影响范围、临时缓解措施，以及已经脱敏的日志或请求示例。维护者会在确认收到后尽快回复，并在修复准备好后更新报告状态。

如果无法使用 Security Advisories，请先创建不包含敏感细节的 Issue，请求私密沟通方式。

## 凭证泄露

如果凭证已经出现在日志、截图、Issue 或提交中，请立即在对应上游或部署平台撤销并轮换凭证，然后再提交脱敏报告。
