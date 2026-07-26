---
title: 第1章 初识智能体
description: 理解 Agent 的本质、感知-决策-执行循环，以及与传统程序的核心区别
---

# 第1章 初识智能体

## 🗺️ 在知识体系中的位置

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0;font-family:sans-serif;font-size:13px">
<span style="background:#3b82f6;color:#fff;padding:6px 14px;border-radius:8px;font-weight:700;border:2px solid #1d4ed8">第1章 初识智能体</span>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part1-foundation/ch02-agent-history" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第2章 发展史</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part1-foundation/ch03-llm-basics" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第3章 LLM 基础</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part2-paradigms/ch04-react" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第4–6章 三大范式</a>
</div>

## 🎯 本章你能学到什么

- 能用一句话准确定义 Agent，并说明它与普通函数调用的本质区别
- 能描述感知-决策-执行三步循环，并对应到实际代码结构中的哪个环节
- 能用表格列出 LLM Agent 与传统 if-else 程序在控制流、适应性等维度上的核心区别
- 能用 Java 视角理解 Agent 的工程本质：它等价于 Worker + Strategy + EventLoop 的组合

## 📖 核心概念

### 什么是 Agent

**结论**：Agent 是一个能够持续感知环境、自主决策并采取行动以达成目标的程序。与普通函数不同，Agent 不是"输入→处理→输出"的单次调用，而是一个不断循环直到任务完成的自主执行体。

更具体地说，LLM Agent 以大语言模型作为"大脑"，通过反复调用 LLM 来决定下一步该做什么——是调用某个工具获取信息，还是直接给出最终答案。这个"反复"是关键：传统程序的执行路径在编写时就已确定，而 Agent 的路径由 LLM 在运行时动态推理产生。

::: tip ⚙️ 工程技巧：Agent ≈ Worker + Strategy + EventLoop

对 Java 后端工程师来说，Agent 的结构并不陌生：

- **Worker**：负责执行具体任务（对应 Agent 中调用工具的"执行"环节）
- **Strategy**：运行时决定执行哪个逻辑（对应 LLM 推理选择下一步行动）
- **EventLoop**：持续监听并处理事件直到终止条件（对应 Agent 的 while 循环）

三者组合在一起，就是 LLM Agent 的工程骨架。
:::

### 感知-决策-执行循环

**结论**：Agent 的工作方式是一个三步循环——感知当前状态、决策下一步行动、执行该行动并观察结果，然后重复，直到任务完成。

**感知（Perceive）**：Agent 接收外部输入，可以是用户的文字消息、工具调用的返回结果，或者对话历史。这些信息构成当前"可观测的环境"。

**决策（Decide）**：将感知到的信息连同系统提示词一起发送给 LLM，由 LLM 推理并输出结构化的"行动指令"——调用哪个工具、传什么参数，或者判定任务已完成。

**执行（Execute）**：按照 LLM 的决策，调用对应的工具函数并获取结果。这个结果会作为新的"感知输入"进入下一轮循环，直到 LLM 决定任务已完成为止。

### Agent 与传统程序的区别

| 对比维度 | 传统程序（if-else/规则引擎） | LLM Agent |
|---------|---------------------------|-----------|
| **控制流** | 编写时硬编码，路径固定 | 运行时由 LLM 动态推理决定 |
| **适应性** | 只能处理预见到的输入模式 | 能泛化处理训练数据覆盖范围内的任意输入 |
| **工具调用** | 调用路径在代码中写死 | LLM 自主选择调用哪个工具及参数 |
| **错误处理** | 必须显式枚举所有异常路径 | LLM 可根据工具返回的错误信息自行调整策略 |

核心差异在于**谁来决策**：传统程序的决策逻辑由开发者提前写入代码；LLM Agent 的决策逻辑运行在 LLM 内部，开发者只需定义工具集合和目标，具体路径由 LLM 推理产生。

## 💻 代码实战

本章为概念章节，以下伪代码用于说明 Agent 循环结构的基本形态。**注意：以下为概念示意，非 HelloAgents 实际代码**，后续章节（第4章 ReAct、第5章 Plan-Solve）将展示来自真实源码的完整实现。

```python
# 概念示意：Agent 核心循环（非 HelloAgents 实际代码）
class ConceptualAgent:
    def run(self, user_input: str) -> str:
        # 1. 感知：接收用户输入，构建初始上下文
        perception = self.perceive(user_input)

        while not self.is_done():
            # 2. 决策：将上下文发送给 LLM，获取下一步行动指令
            action = self.decide(perception)

            # 3. 执行：调用工具或判断任务已完成
            result = self.execute(action)

            # 4. 观察：将工具结果反馈给下一轮的感知输入
            perception = self.observe(result)

        return self.get_final_answer()
```

这个结构中，`decide()` 是唯一依赖 LLM 的环节，其余部分是纯粹的工程代码。理解这一点有助于后续章节分析每种 Agent 范式的差异：ReAct、Plan-Solve、Reflection 本质上都是在这个骨架上，对"决策"环节施加不同的约束和增强。

## 🏢 企业场景落地

Java Spring AI 提供了与 Agent 思想高度对应的接口抽象。`ChatClient` 扮演"大脑"角色，负责与 LLM 通信；`Advisor` 机制类似 AOP，可以在请求前后注入工具调用、上下文管理等能力，整体结构与感知-决策-执行循环一一对应。

下面的示例展示如何用 Spring AI 的 `ChatClient` 构建一个最简单的 Agent 服务，将"感知用户请求 → LLM 决策 → 返回结果"这个循环封装为一个可复用的 Service Bean。

```java
// Spring AI Agent 类比：ChatClient 体现感知-决策-执行循环
// 依赖：spring-ai-openai-spring-boot-starter（或其他 provider）
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;

@Service
public class SimpleAgentService {

    private final ChatClient chatClient;

    public SimpleAgentService(ChatClient.Builder builder) {
        // 配置 Agent 的"大脑"（LLM）和系统角色
        // 等价于 Agent 初始化阶段：设定目标与能力边界
        this.chatClient = builder
            .defaultSystem("你是一个后端系统监控助手，可以查询服务状态和告警信息。")
            .build();
    }

    /**
     * 处理用户请求 —— 对应感知-决策-执行的完整一轮循环
     *
     * @param userQuery 用户输入（感知阶段的原始输入）
     * @return LLM 决策后的最终答案（执行阶段的输出）
     */
    public String processRequest(String userQuery) {
        // 感知：接收用户请求，构建 prompt 上下文
        // 决策+执行：ChatClient 内部驱动 LLM 推理并选择工具（若配置了 FunctionCallingAdvisor）
        return chatClient.prompt()
            .user(userQuery)
            .call()
            .content(); // 返回 LLM 的最终文本答案
    }
}
```

实际生产中，可以在 `builder` 阶段注册 `FunctionCallbackWrapper` 将 Java 方法注册为 LLM 可调用工具，此时 `ChatClient` 会自动完成多轮工具调用循环，完整体现了 Agent 的感知-决策-执行特性。

## ✅ 本章小结

**本章依赖**：无（本章为全局知识链起点，不依赖任何前置章节）

**后续应用**：
- 本章的 **Agent 定义**（自主感知+决策+执行）在第2章中用于梳理历史演化脉络，理解从符号 AI 到 LLM Agent 的思想传承
- 本章的**感知-决策-执行循环**在第4章 ReAct 中被具象化为 Thought-Action-Observation 三元组，在第5章 Plan-Solve 中演变为先规划再执行的两阶段结构，在第6章 Reflection 中扩展为带自评估的反馈循环
- 本章的 **Agent vs 传统程序对比**（运行时动态决策 vs 编译时固定路径）在第7章工具系统中得到具体体现：工具注册表让 Agent 能在运行时动态选择调用哪个工具

Agent 的本质是将"决策权"从代码交给 LLM，开发者的工作重心从"写出所有判断分支"转变为"定义好工具和目标"。这一视角贯穿本手册全程。
