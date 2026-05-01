# 用户指令记忆

本文件记录了用户的指令、偏好和教导，用于在未来的交互中提供参考。

## 格式

### 用户指令条目
用户指令条目应遵循以下格式：

[用户指令摘要]
- Date: [YYYY-MM-DD]
- Context: [提及的场景或时间]
- Instructions:
  - [用户教导或指示的内容，逐行描述]

### 项目知识条目
Agent 在任务执行过程中发现的条目应遵循以下格式：

[项目知识摘要]
- Date: [YYYY-MM-DD]
- Context: Agent 在执行 [具体任务描述] 时发现
- Category: [代码结构|代码模式|代码生成|构建方法|测试方法|依赖关系|环境配置]
- Instructions:
  - [具体的知识点，逐行描述]

## 去重策略
- 添加新条目前，检查是否存在相似或相同的指令
- 若发现重复，跳过新条目或与已有条目合并
- 合并时，更新上下文或日期信息
- 这有助于避免冗余条目，保持记忆文件整洁

## 条目

[用户要求中文输出]
- Date: 2026-05-01
- Context: 项目协作默认沟通方式
- Instructions:
  - 与用户沟通默认使用中文。

[用户要求放宽视觉描述]
- Date: 2026-05-01
- Context: 调整参考图转提示词阶段
- Instructions:
  - 将参考图 vision 描述放宽，不要过度精简。
  - 继续推进生产环境部署并进行测试。

[用户同意限制原始 prompt 长度]
- Date: 2026-05-01
- Context: 为降低中转 502/524 风险而收敛请求体
- Instructions:
  - 为原始 prompt 增加长度限制。
  - 同时提供界面提示和提交前统一截断。

[项目构建与测试方式]
- Date: 2026-05-01
- Context: Agent 在执行 GPT Image Playground 接入与部署任务时发现
- Category: 构建方法
- Instructions:
  - 前端使用 npm。
  - 构建命令为 `npm run build`，实际执行 `tsc -b && vite build`。
  - 测试命令为 `npm run test`，基于 vitest。

[项目生产代理约定]
- Date: 2026-05-01
- Context: Agent 在执行同源部署改造时发现
- Category: 环境配置
- Instructions:
  - 前端在生产环境也统一走 `/api-proxy/`。
  - Nginx 需要将 `/api-proxy/` 反向代理到本机 API 中转端口。
  - 生产容器通过 `API_URL` 注入默认上游地址，通过 `LOCAL_API_PROXY_TARGET` 配置本机反代目标。
