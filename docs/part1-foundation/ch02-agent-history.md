---
title: 第2章 智能体发展史
description: 从规则引擎到 LLM Agent，理解智能体技术的演化脉络
---

# 第2章 智能体发展史

## 🗺️ 在知识体系中的位置

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0;font-family:sans-serif;font-size:13px">
  <a href="/part1-foundation/ch01-what-is-agent" style="background:#f1f5f9;color:#64748b;padding:6px 14px;border-radius:8px;border:1.5px solid #e2e8f0;text-decoration:none">第1章 初识智能体</a>
  <span style="color:#94a3b8;font-size:16px">→</span>
  <span style="background:#3b82f6;color:#fff;padding:6px 14px;border-radius:8px;font-weight:700;border:2px solid #1d4ed8">📍 第2章 发展史</span>
  <span style="color:#94a3b8;font-size:16px">→</span>
  <a href="/part1-foundation/ch03-llm-basics" style="background:#f1f5f9;color:#64748b;padding:6px 14px;border-radius:8px;border:1.5px solid #e2e8f0;text-decoration:none">第3章 LLM 基础</a>
  <span style="color:#94a3b8;font-size:16px">→</span>
  <a href="/part2-paradigms/ch04-react" style="background:#f1f5f9;color:#64748b;padding:6px 14px;border-radius:8px;border:1.5px solid #e2e8f0;text-decoration:none">第4–6章 三大范式 …</a>
</div>

本章承接第1章对 Agent 的定义，沿着历史脉络回答「Agent 是如何演化到今天这种形态的」。理解这条演化链，有助于在第3章深入 LLM 工作机制时，明白为什么 LLM 能成为 Agent 的核心引擎。

## 🎯 本章你能学到什么

- 能用时间线描述智能体技术的四个主要阶段：符号 AI/规则引擎 → 强化学习 Agent → 预训练语言模型 → LLM Agent
- 能说明 Java 规则引擎（Drools）与 LLM Agent 在决策机制上的本质差异
- 能解释为什么 LLM 的出现让通用 Agent 成为可能，而之前的方案都只能解决特定领域问题
- 能用一句话总结各阶段的核心局限性

## 📖 核心概念

<div style="margin:24px 0;font-family:sans-serif">
  <div style="display:flex;flex-direction:column;gap:0">

    <!-- 阶段 1 -->
    <div style="display:flex;gap:16px;align-items:flex-start">
      <div style="display:flex;flex-direction:column;align-items:center">
        <div style="width:36px;height:36px;border-radius:50%;background:#e2e8f0;color:#475569;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">①</div>
        <div style="width:2px;flex:1;background:#e2e8f0;margin:4px 0"></div>
      </div>
      <div style="padding-bottom:24px;padding-top:6px">
        <div style="font-weight:700;color:#1e293b;margin-bottom:2px">符号 AI / 规则引擎</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:6px">1950s – 1980s</div>
        <div style="font-size:13px;color:#475569">专家系统、Drools 规则引擎；人工编写 if-else 树，规则爆炸，无法泛化</div>
      </div>
    </div>

    <!-- 阶段 2 -->
    <div style="display:flex;gap:16px;align-items:flex-start">
      <div style="display:flex;flex-direction:column;align-items:center">
        <div style="width:36px;height:36px;border-radius:50%;background:#dbeafe;color:#1d4ed8;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">②</div>
        <div style="width:2px;flex:1;background:#e2e8f0;margin:4px 0"></div>
      </div>
      <div style="padding-bottom:24px;padding-top:6px">
        <div style="font-weight:700;color:#1e293b;margin-bottom:2px">强化学习 Agent</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:6px">1990s – 2010s</div>
        <div style="font-size:13px;color:#475569">AlphaGo、OpenAI Five；无需手写规则，但只能在明确定义的环境中工作</div>
      </div>
    </div>

    <!-- 阶段 3 -->
    <div style="display:flex;gap:16px;align-items:flex-start">
      <div style="display:flex;flex-direction:column;align-items:center">
        <div style="width:36px;height:36px;border-radius:50%;background:#ede9fe;color:#6d28d9;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">③</div>
        <div style="width:2px;flex:1;background:#e2e8f0;margin:4px 0"></div>
      </div>
      <div style="padding-bottom:24px;padding-top:6px">
        <div style="font-weight:700;color:#1e293b;margin-bottom:2px">预训练语言模型</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:6px">2018 – 2022</div>
        <div style="font-size:13px;color:#475569">BERT、GPT-2；能理解语言，但没有"行动能力"，只能生成文本</div>
      </div>
    </div>

    <!-- 阶段 4 -->
    <div style="display:flex;gap:16px;align-items:flex-start">
      <div style="display:flex;flex-direction:column;align-items:center">
        <div style="width:36px;height:36px;border-radius:50%;background:#dcfce7;color:#15803d;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">④</div>
      </div>
      <div style="padding-top:6px">
        <div style="font-weight:700;color:#1e293b;margin-bottom:2px">LLM Agent <span style="background:#dcfce7;color:#15803d;font-size:11px;padding:2px 8px;border-radius:4px;margin-left:6px">当前阶段</span></div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:6px">2022 – 至今</div>
        <div style="font-size:13px;color:#475569">GPT-4 + Function Calling；LLM 从文字生成器升级为行动决策者，通用 Agent 成为现实</div>
      </div>
    </div>

  </div>
</div>

### 第一阶段：符号 AI 与规则引擎（1950s–1980s）

**结论**：早期智能体依赖人工编写的规则库，本质上是一个精心设计的 if-else 树。

这一阶段的代表是专家系统（Expert System）。工程师将领域知识编写为"条件-结论"规则，推理引擎负责匹配规则并得出结论。在 Java 生态中，Drools 就是这类规则引擎的现代实现——你写规则文件（`.drl`），引擎在运行时匹配事实（Fact）触发规则。

::: tip ⚙️ 工程技巧：Drools 规则引擎 vs LLM Agent

Drools 的决策流程是：Facts 进入工作内存 → 规则引擎匹配 → 触发 Action。整个流程由**人工编写的规则**驱动，对未见过的输入模式束手无策。LLM Agent 的决策流程是：输入进入 Prompt → LLM 推理 → 输出行动指令。决策逻辑由**训练数据中习得的知识**驱动，能泛化处理规则未覆盖的情况。核心差异：规则引擎的"智慧"来自工程师，LLM 的"智慧"来自训练语料。
:::

**局限性**：规则库膨胀迅速，维护成本呈指数增长；无法处理规则未覆盖的输入；每个新领域都需要重新构建规则库，无法迁移。

### 第二阶段：强化学习 Agent（1990s–2010s）

**结论**：通过与环境交互、获取奖励信号来学习策略的 Agent，解决了规则需要人工编写的问题，但只能在定义良好的环境中工作。

AlphaGo（围棋）、OpenAI Five（Dota 2）是这一阶段的巅峰之作。RL Agent 不需要人工编写规则，而是通过海量自我对弈习得策略。

**局限性**：需要精确定义状态空间、动作空间和奖励函数；在开放域任务（如"帮我写一封邮件"）中无法应用，因为这类任务没有清晰的奖励信号；训练成本极高，结果高度任务特异，不可迁移。

### 第三阶段：预训练语言模型（2018–2022）

**结论**：BERT、GPT-2 等预训练模型证明了「用大规模语料预训练，再针对特定任务微调」这条路线的有效性，为通用 Agent 打下了语言理解的基础。

这一阶段模型能理解和生成自然语言，但缺乏"行动能力"——它们只会生成文本，不能调用外部工具、执行代码或访问实时信息。

### 第四阶段：LLM Agent（2022–至今）

**结论**：GPT-4、Claude 等大型语言模型的出现，加上 Function Calling 机制的引入，让 LLM 从"文字生成器"升级为"行动决策者"，通用 Agent 成为现实。

关键转折点是 OpenAI 在 2023 年引入 Function Calling：LLM 不仅能生成文本，还能以结构化 JSON 格式输出"我要调用哪个工具、传什么参数"。这让 LLM 真正成为 Agent 的"大脑"——接收环境状态、决策下一步行动，剩下的工程代码负责执行。

## 💻 代码实战

本章为历史概念章节，以下 Java 代码演示 Drools 规则引擎的决策方式，与 LLM Agent 的对比说明各自的设计哲学。**以下为概念示意代码**，非 HelloAgents 源码。

```java
// 概念示意：Drools 规则引擎的决策模式（传统 AI 方式）
// 规则文件 alert_rules.drl 中定义：当 CPU > 90% 时触发告警
// 工程师必须提前枚举所有可能的条件

import org.kie.api.runtime.KieSession;

public class TraditionalAlertSystem {
    private final KieSession kieSession;

    public void processMetric(ServerMetric metric) {
        // 将 Fact（事实）插入工作内存
        kieSession.insert(metric);
        // 规则引擎自动匹配并触发对应规则——但只能处理 .drl 中预定义的场景
        kieSession.fireAllRules();
        // 问题：如果出现规则中未覆盖的异常模式，引擎对此一无所知
    }
}
```

```python
# 概念对比：LLM Agent 的决策模式（不需要预先枚举规则）
# 来源：概念示意，非 HelloAgents 实际代码
# LLM 可以根据上下文动态推理，即使是从未见过的指标组合

async def llm_agent_decision(metrics: dict) -> str:
    prompt = f"当前服务器指标: {metrics}\n请分析并给出处置建议。"
    # LLM 内部"规则"来自训练语料，不需要工程师手工维护
    response = await llm.ainvoke([{"role": "user", "content": prompt}])
    return response.content
```

## 🏢 企业场景落地

在 Java 后端系统中，Drools 规则引擎被广泛用于风控、促销规则、告警策略等场景。其核心挑战是：业务规则膨胀后，`.drl` 文件难以维护，且无法处理规则之外的异常。

下面的示例展示了两种架构的对比，说明在什么情况下 LLM Agent 可以作为规则引擎的补充或替代：

```java
// Java 后端：LLM Agent 作为规则引擎的"兜底层"
// 已知规则由 Drools 处理（高速、确定性），
// 未知/模糊场景交给 LLM Agent 分析
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Service
public class HybridAlertService {

    private final KieSession kieSession;       // Drools：处理已知规则
    private final LlmAgentClient llmAgent;     // LLM Agent：处理未知场景

    public AlertResult processAlert(AlertEvent event) {
        // 1. 先尝试规则引擎（确定性、低延迟）
        kieSession.insert(event);
        int firedRules = kieSession.fireAllRules();

        if (firedRules > 0) {
            // 命中已知规则，直接返回结构化处置方案
            return AlertResult.fromRuleEngine(event.getProcessedResult());
        }

        // 2. 规则未命中，交给 LLM Agent 动态分析（高灵活性，略高延迟）
        String analysis = llmAgent.analyze(
            "这是一个未知告警类型，请分析可能原因并给出处置步骤: " + event.toString()
        );
        return AlertResult.fromLlm(analysis);
    }
}
```

这种混合架构在金融风控、智能运维（AIOps）场景中已有大量落地案例：确定性规则走 Drools，模糊/新兴场景走 LLM。

## ✅ 本章小结

**本章依赖**：
- 依赖第1章的 **Agent 定义**（感知-决策-执行循环）：本章的四阶段演化，本质上是"决策"这一环节的实现方式从硬编码规则 → 强化学习 → 预训练 → LLM 的演进历程

**后续应用**：
- 本章的 **LLM + Function Calling = Agent 大脑**这一结论，在第3章中得到具体展开：介绍 `invoke_with_tools` 接口就是 Function Calling 的工程实现
- 本章对**规则引擎局限性**的分析，在第7章工具系统中得到呼应：工具注册表（ToolRegistry）是一种更灵活的"规则"管理方式，让 LLM 动态选择调用哪个工具
