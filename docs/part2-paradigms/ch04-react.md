---
title: 第4章 ReAct 范式
description: 理解并实现 Thought-Action-Observation 循环，构建第一个 ReAct Agent
---

# 第4章 ReAct 范式

## 🗺️ 在知识体系中的位置

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0;font-family:sans-serif;font-size:13px">
<a href="/part1-foundation/ch03-llm-basics" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第3章 LLM 基础</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<span style="background:#3b82f6;color:#fff;padding:6px 14px;border-radius:8px;font-weight:700;border:2px solid #1d4ed8">第4章 ReAct</span>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part3-engineering/ch07-tool-system" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第7章 工具系统</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part4-enterprise/ch13-api-gateway-agent" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第13章 API网关实战</a>
</div>

本章是三大 Agent 范式的起点，也是最重要的一章。ReAct 是 HelloAgents 中 `ReActAgent` 的核心实现基础，第7章工具系统、第13章企业实战都以 ReAct 范式为基础。

## 🎯 本章你能学到什么

- 能用 Thought-Action-Observation 三元组描述 ReAct 的完整执行循环
- 能从 `react_agent.py` 源码中识别出这个循环的代码对应位置
- 能说明为什么 HelloAgents 用 Function Calling 而非正则解析来实现 ReAct，以及工程上的优势
- 能用 Java 视角理解 `async def` 和 `@decorator` 在 Python 中的等价概念
- 能独立写出一个基于 `ReActAgent` 的告警处理 Agent

## 📖 核心概念

### ReAct 是什么

**结论**：ReAct（Reasoning + Acting）是一种 Agent 工作范式，LLM 在每一步都**先推理（Thought）再行动（Action）**，行动结果作为**观察（Observation）**反馈给下一轮推理，循环直到任务完成。

ReAct 的核心贡献是将"推理"和"行动"交织在一起，而不是先规划全部步骤再执行（Plan-Solve）。这使得 Agent 能根据实时工具返回结果动态调整策略，适合信息不完整、需要边探索边决策的场景。

### HelloAgents 的 ReAct 实现：Function Calling

**结论：`ReActAgent` 不用正则表达式解析 LLM 输出的文本，而是通过 OpenAI Function Calling 以结构化 JSON 接收 Thought 和 Action，可靠性从约 70% 提升到 99%+。

::: tip ⚙️ 工程技巧：为什么不用正则解析？

早期 ReAct 实现要求 LLM 输出固定格式的文本（如 `Action: search[query]`），然后用正则提取工具名和参数。这有两个工程问题：1）LLM 输出不稳定，正则经常解析失败；2）多工具并行调用时格式容易混乱。

`ReActAgent` 改用 Function Calling：LLM 直接输出结构化 JSON，框架层面保证格式正确。这等价于 Java 中用 `@RequestBody` 接收 JSON 而非自己解析 HTTP 请求字符串——永远不要手动解析有标准库支持的格式化数据。
:::

### Thought 工具与 Finish 工具

`ReActAgent` 内置了两个特殊工具，通过 Function Calling 机制调用：

```python
# 来源: hello_agents/agents/react_agent.py
# Thought 工具：让 LLM 显式记录推理过程
{
    "type": "function",
    "function": {
        "name": "Thought",
        "description": "分析问题，制定策略，记录推理过程。在需要思考时调用此工具。",
        "parameters": {
            "type": "object",
            "properties": {
                "reasoning": {
                    "type": "string",
                    "description": "你的推理过程和分析"
                }
            },
            "required": ["reasoning"]
        }
    }
}
```

```python
# 来源: hello_agents/agents/react_agent.py
# Finish 工具：LLM 判断任务完成时调用，携带最终答案
{
    "type": "function",
    "function": {
        "name": "Finish",
        "description": "当你有足够信息得出结论时，使用此工具返回最终答案。",
        "parameters": {
            "type": "object",
            "properties": {
                "answer": {
                    "type": "string",
                    "description": "最终答案"
                }
            },
            "required": ["answer"]
        }
    }
}
```

## 💻 代码实战

### ReAct 主循环：`_run_impl`

这是整个 ReAct 范式的核心，Thought-Action-Observation 三元组在这里得到完整体现：

```python
# 来源: hello_agents/agents/react_agent.py — _run_impl 方法核心片段
while current_step < self.max_steps:  # 循环直到达到最大步数
    current_step += 1

    # ① 行动（Action）：调用 LLM + Function Calling，获取下一步工具调用指令
    response = self.llm.invoke_with_tools(
        messages=messages,         # 包含历史上下文的完整消息列表
        tools=tool_schemas,        # Thought + Finish + 用户工具的 JSON Schema
        tool_choice="auto",        # LLM 自主决定是否调用工具及调用哪个
    )

    tool_calls = response.tool_calls
    if not tool_calls:
        # LLM 没有调用工具，直接返回文本（任务完成的另一种形式）
        return response.content

    # 将 assistant 消息（含工具调用请求）加入历史，保持上下文连贯
    messages.append({
        "role": "assistant",
        "content": response.content,
        "tool_calls": [{"id": tc.id, "type": "function",
                        "function": {"name": tc.name, "arguments": tc.arguments}}
                       for tc in tool_calls]
    })

    # ② 执行工具 + ③ 观察（Observation）
    for tool_call in tool_calls:
        tool_name = tool_call.name
        arguments = json.loads(tool_call.arguments)  # 解析 JSON 参数

        if tool_name == "Thought":
            # 推理工具：记录 LLM 的思考过程，不触发真实执行
            print(f"💭 推理: {arguments['reasoning']}")
            result_content = f"推理: {arguments['reasoning']}"

        elif tool_name == "Finish":
            # 结束工具：LLM 判断任务已完成，返回最终答案
            return arguments["answer"]  # ← ReAct 循环的出口

        else:
            # 用户工具：调用真实的外部工具并获取结果
            result_content = self._execute_tool_call(tool_name, arguments)
            print(f"👀 观察: {result_content}")

        # 将工具结果（Observation）加入消息历史，反馈给下一轮 LLM 推理
        messages.append({
            "role": "tool",              # tool role 是 OpenAI 消息协议的标准格式
            "tool_call_id": tool_call.id,
            "content": result_content   # 观察结果成为下一轮的"感知输入"
        })
```

### 工具 Schema 构建：`_build_tool_schemas`

```python
# 来源: hello_agents/agents/react_agent.py — _build_tool_schemas 方法
def _build_tool_schemas(self) -> List[Dict[str, Any]]:
    """构建工具 JSON Schema（包含内置工具和用户工具）"""
    schemas = []
    # 1. 先添加内置工具：Thought 和 Finish
    schemas.append(THOUGHT_TOOL_SCHEMA)  # 推理记录工具
    schemas.append(FINISH_TOOL_SCHEMA)   # 任务完成工具
    # 2. 再追加用户注册的业务工具（来自 ToolRegistry）
    if self.tool_registry:
        user_tool_schemas = super()._build_tool_schemas()  # 复用基类方法
        schemas.extend(user_tool_schemas)
    return schemas
```

::: details ☕ Java 对比：`@decorator` vs `@Annotation + AOP`

`ReActAgent` 中 `@tool_action` 装饰器（在工具系统章节展开）用于将普通函数注册为工具，这是 Python 装饰器的典型用法。

```python
# 来源: 概念示意（@tool_action 装饰器在第7章 hello_agents/tools/base.py 中详细展开）
# Python：@decorator 在函数定义时包裹逻辑，运行时立即生效
from hello_agents.tools.base import tool_action

@tool_action(name="search_alerts", description="搜索告警记录")
def search_alerts(keyword: str) -> str:
    return f"找到与 '{keyword}' 相关的告警 3 条"
```

```java
// Java 等价：@Annotation 标记 + Spring AOP 代理拦截
@ToolAction(name = "searchAlerts", description = "搜索告警记录")
public String searchAlerts(String keyword) {
    return "找到与 '" + keyword + "' 相关的告警 3 条";
}
// AOP 切面在方法调用时自动将该方法注册到 ToolRegistry
```

核心差异：Python decorator 在**模块加载时**立即执行包裹逻辑；Java `@Annotation + AOP` 在运行时由代理对象拦截方法调用。Python 是编译期行为，Java AOP 是运行期代理。
:::

## 🏢 企业场景落地

Java 后端系统中，告警处理流程通常是：监控系统发现异常 → 触发告警 → 值班工程师手动排查 → 执行处置脚本。这个过程高度依赖人工经验，且重复性高。ReAct Agent 可以将"排查 → 决策 → 处置"这个循环自动化。

以下是一个完整可运行的告警处理 Agent 示例，基于 `ReActAgent` 构建：

```python
# 来源依赖: hello_agents/agents/react_agent.py (ReActAgent)
# 来源依赖: hello_agents/tools/base.py (tool_action 装饰器)
# 企业场景：自动化告警处理 Agent
import asyncio
from hello_agents.agents.react_agent import ReActAgent
from hello_agents.core.llm import HelloAgentsLLM
from hello_agents.tools.registry import ToolRegistry
from hello_agents.tools.base import tool_action


# ① 定义告警处理工具集（对应 Java 中的 @Service 方法）
@tool_action(name="get_alert_detail", description="根据告警 ID 获取告警详情")
def get_alert_detail(alert_id: str) -> str:
    """模拟查询告警系统，实际应调用监控平台 API"""
    return f"告警 {alert_id}: CPU 使用率 95%，持续 5 分钟，服务: order-service"


@tool_action(name="get_service_metrics", description="获取指定服务的当前性能指标")
def get_service_metrics(service_name: str) -> str:
    """模拟查询 Prometheus/Grafana API"""
    metrics = {
        "order-service": "CPU: 95%, Memory: 78%, QPS: 1200, P99: 2300ms",
        "payment-service": "CPU: 45%, Memory: 55%, QPS: 800, P99: 450ms",
    }
    return metrics.get(service_name, f"未找到服务 {service_name} 的指标")


@tool_action(name="trigger_scale_out", description="触发服务水平扩容")
def trigger_scale_out(service_name: str, replicas: int) -> str:
    """模拟调用 Kubernetes API 进行扩容"""
    return f"已触发 {service_name} 扩容至 {replicas} 个副本，预计 2 分钟生效"


def create_alert_agent() -> ReActAgent:
    """创建告警处理 Agent"""
    llm = HelloAgentsLLM()

    # ② 注册工具到 ToolRegistry（对应 Java Spring 的 Bean 注册）
    registry = ToolRegistry()
    registry.register_tool(get_alert_detail)
    registry.register_tool(get_service_metrics)
    registry.register_tool(trigger_scale_out)

    # ③ 创建 ReActAgent（LLM 大脑 + 工具集 + 最大步数限制）
    return ReActAgent(
        name="alert-handler",
        llm=llm,
        tool_registry=registry,
        system_prompt="你是一个自动化告警处理 Agent。收到告警后，先查询详情和性能指标，再决策处置方案并执行。",
        max_steps=8  # 防止无限循环，对应 Java 线程池的 timeout 设置
    )


if __name__ == "__main__":
    agent = create_alert_agent()
    # 模拟收到告警，触发自动处理流程
    result = agent.run("收到告警 ALERT-20240115-001，请自动排查并处置")
    print(f"\n处置结果: {result}")
```

## ✅ 本章小结

**本章依赖**：
- 依赖第3章的 **`invoke_with_tools` 接口：ReAct 的 Thought/Action 循环完全依赖 Function Calling 机制，`invoke_with_tools` 是驱动整个循环的引擎
- 依赖第3章的**消息协议（role: tool）：Observation 结果以 `tool` 角色消息追加到历史，这是 ReAct 循环能保持上下文的关键

**后续应用**：
- 本章的 **ReAct 循环结构**（while + invoke_with_tools + 工具执行）是第7章工具系统的直接使用者，理解 ReAct 后才能理解为什么需要 ToolRegistry 和 CircuitBreaker
- 本章的 **`max_steps` 限制思想在第10章熔断器中得到工程化升级：不只是步数限制，而是基于失败率的动态熔断
- 本章的 `ReActAgent` 在第13章 API 网关实战中与 ToolRegistry、CircuitBreaker、TraceLogger 组合，构建完整的企业级 Agent
