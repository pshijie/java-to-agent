<div align="center">

# 🤖 Java 工程师的 Agent 转型手册

**基于 HelloAgents 真实源码 · 15 章系统进阶 · 企业场景全覆盖**

[![VitePress](https://img.shields.io/badge/VitePress-1.6-646cff?logo=vite&logoColor=white)](https://vitepress.dev/)
[![HelloAgents](https://img.shields.io/badge/源码-HelloAgents-3b82f6)](https://github.com/jjyaoao/HelloAgents)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

[📖 在线阅读](https://java-to-agent-5exj.vercel.app/) · [🚀 快速开始](#快速开始) · [📋 章节目录](#章节目录)

</div>

---

## 这是什么

专门为 **有 Java 后端经验、希望转型 Agent 工程师** 的开发者打造的学习文档站。

大多数 Agent 教程存在四个让人头疼的问题：

| 痛点 | 本手册的解法 |
|------|-------------|
| 章节孤立，看完忘了前后关联 | 每章开头有知识体系卡片图，每章结尾写清楚「依赖什么、被谁用」 |
| Python 语法劝退 Java 开发者 | 遇到 `async/await`、装饰器、`with` 等，立刻插入 ☕ Java 对比块 |
| 示例都是"搜索华为手机"玩具案例 | 每章末尾有完整可运行的企业场景（API 网关 / 数据查询 / AIOps） |
| 代码贴上去不解释为什么这样设计 | 遇到非显而易见的设计决策，插入 ⚙️ 工程技巧块说明等价 Java 组件 |

代码唯一来源是 [HelloAgents](https://github.com/jjyaoao/HelloAgents) 真实框架源码，所有引用均标注文件路径。

---

## 章节目录

```
LLM 基础 → 三大范式 → 框架工程化 → 企业落地实战
```

**Part 1 · 基础认知**

- 第 1 章：初识智能体 — Agent 是什么，感知-决策-执行循环
- 第 2 章：智能体发展史 — 规则引擎 → 强化学习 → LLM Agent
- 第 3 章：LLM 基础 — 消息协议、invoke/ainvoke、Function Calling

**Part 2 · 三大 Agent 范式**

- 第 4 章：ReAct — Thought-Action-Observation 循环，Function Calling 实现
- 第 5 章：Plan-Solve — 先规划再执行，Planner + Executor 分离架构
- 第 6 章：Reflection — 自评估迭代优化，Memory 模块与质量控制

**Part 3 · 框架工程化**

- 第 7 章：工具系统 — `Tool` 基类、`ToolRegistry`、`ToolResponse` 三态协议
- 第 8 章：上下文工程 — GSSC 流水线，token 预算管理
- 第 9 章：会话持久化 — `SessionStore` 原子写入，断点续传
- 第 10 章：熔断器 — CircuitBreaker 状态机，防雪崩
- 第 11 章：子代理机制 — `TaskTool`，上下文隔离与任务编排
- 第 12 章：可观测性 — `TraceLogger` 双格式，生产链路追踪

**Part 4 · 企业落地实战**

- 第 13 章：API 网关 Agent — ReAct + ToolRegistry + CircuitBreaker + TraceLogger
- 第 14 章：数据查询 Agent — 自然语言转 SQL，多轮修正，会话持久化
- 第 15 章：多 Agent 系统 — AIOps 监控-分析-响应自动化工作流

**附录**

- Python → Java 速查对照表（12 组概念，含代码示例）
- Agent 领域术语表（24 条，中英文对照）

---

## 快速开始

### 在线阅读

> 部署地址待补充

### 本地运行

```bash
git clone https://github.com/your-username/java-to-agent
cd java-to-agent
npm install
npm run docs:dev
```

浏览器访问 `http://localhost:5173`

---

## 技术栈

- **文档框架**：[VitePress 1.6](https://vitepress.dev/) — 构建速度快，Markdown 原生支持
- **代码来源**：[HelloAgents](https://github.com/jjyaoao/HelloAgents) — Python Agent 框架
- **图表**：HTML/CSS 卡片流 + 时间线（首页知识架构图）

---

## 贡献

发现笔误或有改进建议？欢迎 [提 Issue](../../issues) 或直接 PR。

---

<div align="center">

如果这个手册帮到了你，欢迎 ⭐ Star 支持一下

</div>
