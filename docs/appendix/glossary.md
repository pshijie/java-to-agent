# 术语表 Glossary

本术语表收录《Agent 工程师成长手册》中出现的核心专业术语，按拼音首字母分组排列，供读者快速查阅。

---

## A

### Agent（智能体）

**英文**：Agent
**定义**：能够感知环境、做出决策并执行动作以实现目标的自主系统。在 LLM 时代，Agent 通常指以大语言模型为"大脑"，结合工具调用能力，能够自主完成复杂任务的智能程序。

---

## C

### Circuit Breaker（熔断器）

**英文**：Circuit Breaker
**定义**：一种故障保护机制，当外部服务调用失败次数超过阈值时，自动"熔断"后续请求，避免级联故障。在 Agent 系统中常用于保护工具调用，等价于 Java 生态中的 Resilience4j Circuit Breaker。

---

### Context Window（上下文窗口）

**英文**：Context Window
**定义**：LLM 每次推理时能处理的最大 Token 数量上限，决定了模型"记得住"多少历史信息。超出上下文窗口的内容会被截断或丢弃，因此上下文管理是 Agent 工程的核心挑战之一。

---

## F

### Few-shot（少样本）

**英文**：Few-shot
**定义**：在 Prompt 中提供少量（通常 2–5 个）示例来引导模型按期望格式输出的技术。与 Zero-shot（零样本）相对，Few-shot 能显著提升模型在特定任务上的表现，但会占用一定的上下文窗口空间。

---

### Function Calling（函数调用）

**英文**：Function Calling
**定义**：LLM 原生支持的结构化输出能力，允许模型以标准 JSON 格式请求调用预定义函数。Function Calling 是 Tool Calling 的底层机制，使 Agent 能够以可靠的格式触发外部能力，而非依赖文本解析。

---

## H

### Hallucination（幻觉）

**英文**：Hallucination
**定义**：LLM 生成看似合理但实际上不准确或凭空捏造的内容的现象。在 Agent 系统中，幻觉可能导致错误的工具调用参数或虚假的推理步骤，是工程可靠性的主要挑战之一。

---

## L

### LLM（大语言模型）

**英文**：Large Language Model
**定义**：基于 Transformer 架构、在海量文本语料上预训练的生成式语言模型，具备文本理解、推理和生成能力。LLM 是 Agent 系统的核心推理引擎，承担感知输入、生成计划、输出工具调用请求等职责。

---

## M

### Multi-Agent（多智能体）

**英文**：Multi-Agent
**定义**：由多个 Agent 协同工作以完成复杂任务的系统架构。各 Agent 可专注于不同子任务，通过 Orchestrator 协调消息传递和任务分配，整体能力超越单一 Agent 的上限。

---

## O

### Observability（可观测性）

**英文**：Observability
**定义**：通过日志、指标（Metrics）和追踪（Trace）三类信号，在不修改系统内部的前提下理解系统运行状态的能力。在 Agent 系统中，可观测性帮助工程师诊断推理链路、工具调用延迟和错误根因。

---

### Orchestrator（编排器）

**英文**：Orchestrator
**定义**：Multi-Agent 系统中负责任务分解、Agent 调度与结果汇总的控制层组件。Orchestrator 决定将子任务分配给哪个 Sub-Agent，并将各 Agent 的输出整合为最终结果，类似于微服务架构中的 API 网关或 BFF 层。

---

## P

### Plan-Solve（规划求解范式）

**英文**：Plan-Solve
**定义**：Agent 工作范式之一，将任务分为"制定完整计划"和"按计划逐步执行"两个阶段。与 ReAct 的逐步交替推理不同，Plan-Solve 先生成全局执行计划，再依计划顺序调用工具，适合结构清晰的确定性任务。

---

### Prompt（提示词）

**英文**：Prompt
**定义**：发送给 LLM 的输入文本，包含指令、上下文信息、示例等内容，直接影响模型的输出质量和行为。Prompt 的设计称为"提示工程"（Prompt Engineering），是 Agent 开发的核心技能之一。

---

## R

### RAG（检索增强生成）

**英文**：Retrieval-Augmented Generation
**定义**：通过在生成前从外部知识库检索相关文档片段，并将其注入 Prompt 的技术，用于解决 LLM 知识截止日期和幻觉问题。RAG 是 Agent 系统访问私域知识的主流方案，类似于 Java 系统中的搜索引擎 + 数据库联合查询。

---

### ReAct（推理行动范式）

**英文**：ReAct (Reasoning + Acting)
**定义**：Agent 工作范式之一，交替执行"推理（Thought）→ 行动（Action）→ 观察（Observation）"三步循环。每轮循环后 Agent 根据工具返回结果更新推理状态，直至任务完成，是目前最主流的 Agent 执行模式。

---

### Reflection（反思范式）

**英文**：Reflection
**定义**：Agent 工作范式之一，在生成输出后由模型（或另一 Agent）对输出质量进行评估和批判，并将反思结果反馈给生成模块进行迭代优化。Reflection 可有效提升 Agent 输出的准确性和完整性，尤其适用于代码生成和内容创作场景。

---

## S

### Session（会话）

**英文**：Session
**定义**：用户与 Agent 之间一次完整交互过程的抽象单元，包含该次交互的消息历史、工具调用记录和状态信息。Session 的持久化（Session Store）使 Agent 能够在多轮对话中保持上下文连贯性，类似于 Web 应用中的 HttpSession。

---

### Sub-Agent（子代理）

**英文**：Sub-Agent
**定义**：在 Multi-Agent 架构中，由 Orchestrator 调度、专注执行特定子任务的 Agent 实例。Sub-Agent 通常具备专门的 System Prompt 和工具集，其执行结果汇报给 Orchestrator，是实现 Agent 能力水平扩展的基本单元。

---

### System Prompt（系统提示词）

**英文**：System Prompt
**定义**：在对话开始前注入模型的隐式指令，用于设定 Agent 的角色、行为规范、输出格式和工具使用约束。System Prompt 相当于 Agent 的"配置文件"，对整个会话的输出风格和能力边界有决定性影响。

---

## T

### Token（令牌）

**英文**：Token
**定义**：LLM 处理文本的基本单位，通常为 1–4 个字符或一个词片段。Token 数量直接影响 LLM API 的调用费用和上下文窗口占用，是 Agent 成本优化的核心度量指标。

---

### Tool（工具）

**英文**：Tool
**定义**：Agent 可调用的外部能力单元，如搜索引擎、数据库查询、代码执行器、HTTP 请求等。Tool 为 LLM 提供了超越语言生成的行动能力，是 Agent 与现实世界交互的桥梁。

---

### Tool Calling（工具调用）

**英文**：Tool Calling
**定义**：Agent 在推理过程中请求执行某个工具的行为，通常以结构化 JSON 格式表达工具名称和参数。Tool Calling 是 Agent 能力的核心体现，底层依赖 Function Calling 机制实现，执行结果作为 Observation 返回给 LLM。

---

### ToolRegistry（工具注册表）

**英文**：Tool Registry
**定义**：集中管理 Agent 可用工具元信息（名称、描述、参数 Schema）的注册中心组件。ToolRegistry 在 Agent 初始化时将工具定义注入 LLM，使模型了解可调用的能力边界，类似于 Java 中的 Spring Bean 容器或服务注册中心。

---

### Trace（追踪）

**英文**：Trace
**定义**：记录一次 Agent 任务执行的完整调用链路，包括每个推理步骤、工具调用、耗时和输出内容的结构化日志。Trace 是 Agent 可观测性的核心数据，用于调试、性能分析和行为审计，等价于微服务架构中的分布式链路追踪（如 Zipkin/Jaeger）。

---

## Z

### Zero-shot（零样本）

**英文**：Zero-shot
**定义**：在 Prompt 中不提供任何示例，仅通过指令描述任务，要求模型直接完成的推理方式。Zero-shot 对模型能力要求更高，但节省上下文窗口空间，适合能力强的大型模型在简单任务中使用。

---

> 💡 **提示**：点击章节正文中的术语链接可跳转至本表对应条目。如发现术语缺失，欢迎提交 Issue 补充。
