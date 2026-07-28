---
title: 第15章 多 Agent 系统实战
description: 综合运用 ReAct + TaskTool + TraceLogger + CircuitBreaker，构建企业级多 Agent 监控-分析-响应工作流
---

# 第15章 多 Agent 系统实战

## 🗺️ 在知识体系中的位置

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0;font-family:sans-serif;font-size:13px">
<a href="/part2-paradigms/ch04-react" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第4章 ReAct</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part3-engineering/ch11-sub-agent" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第11章 子代理</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part3-engineering/ch12-observability" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第12章 可观测性</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<span style="background:#3b82f6;color:#fff;padding:6px 14px;border-radius:8px;font-weight:700;border:2px solid #1d4ed8">第15章 多Agent系统</span>
</div>

本章是全局知识链的终点，综合运用手册中所有核心组件，构建一个完整的企业级多 Agent 系统：**监控 Agent** 发现异常 → **分析 Agent** 定位根因 → **处置 Agent** 执行修复，形成自动化的 AIOps 工作流。

## 🎯 本章你能学到什么

- 能设计一个有明确职责分工的多 Agent 架构（Orchestrator + 专职 Sub-Agent）
- 能解释 `TaskTool` 如何让主 Agent 以"工具调用"的方式触发子代理执行
- 能说明在多 Agent 系统中，CircuitBreaker 应该在哪一层配置（主 Agent 还是子 Agent）
- 能用 TraceLogger 追踪跨 Agent 的完整执行链路

## 📖 核心概念

::: tip 🧩 本章用到的组件速览（如你跳章阅读，先看这里）

| 组件 | 一句话说明 | 详细章节 |
|------|-----------|---------|
| **ReActAgent** | 推理-行动循环：LLM 决策 → 执行工具 → 观察结果 → 继续/完成 | [第4章](/part2-paradigms/ch04-react) |
| **TaskTool** | 启动独立子代理执行子任务，上下文隔离，只返回摘要给主 Agent | [第11章](/part3-engineering/ch11-sub-agent) |
| **CircuitBreaker** | 工具连续失败后自动断路，防止雪崩（≈ Resilience4j） | [第10章](/part3-engineering/ch10-circuit-breaker) |
| **TraceLogger** | 记录完整执行链路为 JSONL+HTML，支持跨 Agent 追踪 | [第12章](/part3-engineering/ch12-observability) |
| **ToolRegistry** | 工具注册中心，每个 Sub-Agent 有独立的 ToolRegistry | [第7章](/part3-engineering/ch07-tool-system) |
:::

### 多 Agent 系统架构设计

**核心原则**：单一职责——每个 Agent 只负责一类任务，通过 Orchestrator 协调。

```text
Orchestrator（协调者）
├── 监控 Sub-Agent  → 职责：收集指标、发现异常
├── 分析 Sub-Agent  → 职责：根因分析、生成诊断报告
└── 处置 Sub-Agent  → 职责：执行修复操作（扩容、重启、降级）
```

与 Java 微服务类比：Orchestrator ≈ API Gateway，Sub-Agent ≈ 各个微服务。各服务独立部署（独立上下文），通过网关（TaskTool）协调通信。

### 为什么 Orchestrator 不直接执行所有工具

如果 Orchestrator 直接调用所有工具，它的上下文会被大量中间结果填满，超出 token 窗口。通过 `TaskTool`，各子代理的详细执行历史封装在各自的隔离上下文中，Orchestrator 只收到摘要（`return_summary=True`），保持上下文精简。

这等价于微服务架构中 API Gateway 不直接执行业务逻辑，而是调用各微服务——关注点分离。

## 💻 代码实战

下面的代码分为三个部分阅读：**① 专职工具定义**（每个 Sub-Agent 的能力）→ **② 多 Agent 系统工厂**（如何组装 Orchestrator + Sub-Agent）→ **③ 运行示例**（完整 AIOps 工作流）。

### ① 各专职 Sub-Agent 的工具

监控 Agent、分析 Agent、处置 Agent 各有自己的工具集，互相独立（最小权限原则）。

```python
# 来源: hello_agents/agents/react_agent.py (ReActAgent)
# 来源: hello_agents/tools/builtin/task_tool.py (TaskTool)
# 来源: hello_agents/tools/registry.py (ToolRegistry)
# 来源: hello_agents/tools/circuit_breaker.py (CircuitBreaker)
# 来源: hello_agents/observability/trace_logger.py (TraceLogger)
# 来源: hello_agents/tools/base.py (tool_action)
# 来源: hello_agents/core/llm.py (HelloAgentsLLM)
from hello_agents.agents.react_agent import ReActAgent
from hello_agents.tools.builtin.task_tool import TaskTool
from hello_agents.tools.registry import ToolRegistry
from hello_agents.tools.circuit_breaker import CircuitBreaker
from hello_agents.observability.trace_logger import TraceLogger
from hello_agents.tools.base import tool_action
from hello_agents.core.llm import HelloAgentsLLM


# ─── 监控工具（供监控 Sub-Agent 使用）───────────────────────

@tool_action(name="get_metrics", description="获取服务性能指标（CPU、内存、QPS、延迟）")
def get_metrics(service_name: str) -> str:
    metrics = {
        "order-service":   "CPU:92%, Memory:78%, QPS:1850, P99:3200ms, ErrorRate:8.5%",
        "payment-service": "CPU:45%, Memory:55%, QPS:420, P99:380ms, ErrorRate:0.1%",
        "user-service":    "CPU:30%, Memory:40%, QPS:290, P99:120ms, ErrorRate:0.0%",
    }
    return metrics.get(service_name, f"{service_name}: 指标不可用")


@tool_action(name="get_alert_events", description="获取最近的告警事件列表")
def get_alert_events(time_range: str = "1h") -> str:
    return f"[最近{time_range}] 3 条告警：order-service CPU 超 90%(持续 5min)，P99 超阈值(3000ms)，错误率超 5%"


# ─── 诊断工具（供分析 Sub-Agent 使用）───────────────────────

@tool_action(name="get_slow_queries", description="获取慢查询日志")
def get_slow_queries(service_name: str) -> str:
    return f"{service_name} 慢查询：SELECT * FROM orders WHERE status='pending'（无索引，执行 2800ms）"


@tool_action(name="get_thread_pool_status", description="获取线程池状态")
def get_thread_pool_status(service_name: str) -> str:
    if service_name == "order-service":
        return "order-service 线程池：200/200 活跃，队列积压 500 任务，拒绝 120 任务"
    return f"{service_name} 线程池：正常（50/200）"


# ─── 处置工具（供处置 Sub-Agent 使用）───────────────────────

@tool_action(name="scale_out", description="触发服务水平扩容")
def scale_out(service_name: str, replicas: int) -> str:
    return f"✅ {service_name} 扩容指令已下发：从 2 个副本扩展到 {replicas} 个副本，预计 90 秒生效"


@tool_action(name="toggle_circuit_breaker", description="手动开启/关闭熔断器")
def toggle_circuit_breaker(service_name: str, action: str) -> str:
    return f"✅ {service_name} 熔断器已{action}，上游流量将{('被拦截' if action == '开启' else '恢复转发')}"


@tool_action(name="add_database_index", description="为指定表字段添加索引（异步执行）")
def add_database_index(table: str, column: str) -> str:
    return f"✅ 已提交索引创建任务：ALTER TABLE {table} ADD INDEX idx_{column} ({column})，预计 3 分钟完成"


# ─── 多 Agent 系统工厂 ────────────────────────────────────────
```

### ② 多 Agent 系统组装

核心设计：每个 Sub-Agent 有**独立的 ToolRegistry**（权限隔离），Orchestrator 只持有 `TaskTool`（只能调度，不能直接操作）。

`agent_factory` 是一个工厂函数——根据 `agent_type` 参数返回不同专职的 Agent 实例（≈ Spring 的 `@Scope("prototype")` Bean）。

```python
# ─── 多 Agent 系统工厂 ────────────────────────────────────────

def create_multi_agent_system():
    """
    创建三层多 Agent 系统：
    Orchestrator（协调） → 监控 Sub-Agent → 分析 Sub-Agent → 处置 Sub-Agent
    """
    llm = HelloAgentsLLM()

    # 各 Sub-Agent 的专用工具注册表
    monitor_registry = ToolRegistry(circuit_breaker=CircuitBreaker(failure_threshold=3))
    monitor_registry.register_function(get_metrics)
    monitor_registry.register_function(get_alert_events)

    analysis_registry = ToolRegistry(circuit_breaker=CircuitBreaker(failure_threshold=3))
    analysis_registry.register_function(get_slow_queries)
    analysis_registry.register_function(get_thread_pool_status)

    remediation_registry = ToolRegistry(circuit_breaker=CircuitBreaker(failure_threshold=2))
    remediation_registry.register_function(scale_out)
    remediation_registry.register_function(toggle_circuit_breaker)
    remediation_registry.register_function(add_database_index)

    # Sub-Agent 工厂：根据类型创建专职 Agent
    def agent_factory(agent_type: str) -> ReActAgent:
        configs = {
            "monitor": {
                "registry": monitor_registry,
                "prompt": "你是监控专员，负责收集服务指标和告警事件，输出异常摘要。",
                "max_steps": 4
            },
            "analyst": {
                "registry": analysis_registry,
                "prompt": "你是根因分析专家，根据监控数据深挖慢查询、线程阻塞等根本原因。",
                "max_steps": 4
            },
            "remediation": {
                "registry": remediation_registry,
                "prompt": "你是处置执行者，根据分析结论执行具体修复操作（扩容、熔断、加索引等）。",
                "max_steps": 5
            },
        }
        cfg = configs.get(agent_type)
        if not cfg:
            raise ValueError(f"未知 agent_type: {agent_type}")

        return ReActAgent(
            name=f"{agent_type}-subagent",
            llm=llm,
            tool_registry=cfg["registry"],
            system_prompt=cfg["prompt"],
            max_steps=cfg["max_steps"]
        )

    # Orchestrator：只有 TaskTool，负责协调三个专职 Sub-Agent
    orchestrator_registry = ToolRegistry()
    orchestrator_registry.register_tool(TaskTool(agent_factory=agent_factory))

    trace_logger = TraceLogger(output_dir="memory/traces")

    orchestrator = ReActAgent(
        name="aiops-orchestrator",
        llm=llm,
        tool_registry=orchestrator_registry,
        system_prompt="""你是 AIOps 自动化运维协调者。

收到告警时，按以下工作流处理：
1. 用 Task 工具（agent_type=monitor）启动监控 Sub-Agent，收集受影响服务的指标和告警
2. 用 Task 工具（agent_type=analyst）启动分析 Sub-Agent，深度分析根因
3. 用 Task 工具（agent_type=remediation）启动处置 Sub-Agent，执行修复操作
4. 汇总三个 Sub-Agent 的结果，输出完整的事件报告

重要：每个 Sub-Agent 独立执行，通过 task 参数传递上下文。""",
        max_steps=10
    )
    orchestrator.trace_logger = trace_logger

    return orchestrator, trace_logger
```

## 🏢 企业场景落地

完整的 AIOps 自动化运维工作流演示：

```python
# 完整可运行示例
from hello_agents.agents.react_agent import ReActAgent
from hello_agents.tools.builtin.task_tool import TaskTool
from hello_agents.tools.registry import ToolRegistry
from hello_agents.tools.circuit_breaker import CircuitBreaker
from hello_agents.observability.trace_logger import TraceLogger
from hello_agents.tools.base import tool_action
from hello_agents.core.llm import HelloAgentsLLM
# （复用上方定义的工具函数和 create_multi_agent_system）

if __name__ == "__main__":
    orchestrator, trace_logger = create_multi_agent_system()

    print("=== 🚨 收到生产告警，启动自动化处置流程 ===\n")

    result = orchestrator.run(
        "【P1 告警】order-service 性能严重下降：CPU 92%，P99 延迟 3200ms（超阈值 3倍），"
        "错误率 8.5%（超阈值 17倍），影响用户下单流程。"
        "请立即排查根因并执行处置措施，输出完整事件报告。"
    )

    print("\n" + "="*50)
    print("📋 自动化处置报告")
    print("="*50)
    print(result)

    trace_logger.finalize()
    print("\n✅ 完整执行链路已记录，可查看 HTML 报告了解每个 Sub-Agent 的详细执行过程")

    # 预期执行流程：
    # 1. Orchestrator → Task(monitor) → 收集 order-service 指标
    #    返回：CPU 92%, QPS 1850, P99 3200ms, ErrorRate 8.5%
    # 2. Orchestrator → Task(analyst) → 分析告警+慢查询+线程池
    #    返回：根因是慢查询（无索引）导致线程池耗尽，进而引发级联延迟
    # 3. Orchestrator → Task(remediation) → 执行三步修复
    #    - scale_out(order-service, 5)：扩容缓解压力
    #    - add_database_index(orders, status)：加索引解决根因
    #    - toggle_circuit_breaker(order-service, 开启)：保护下游
    # 4. Orchestrator 汇总输出完整事件报告
```

::: tip ⚙️ 工程技巧：Multi-Agent ≈ Spring Batch 并行步骤

Spring Batch 的 `FlowBuilder.split()` 允许多个 Step 并行执行：

```java
// Java：Spring Batch 并行 Step
Flow splitFlow = new FlowBuilder<SimpleFlow>("splitFlow")
    .split(taskExecutor)
    .add(monitorFlow, analysisFlow)  // 并行执行
    .build();
```

多 Agent 系统中，Orchestrator 可以用 `asyncio.gather()` 并行启动多个 Sub-Agent：

```python
# Python：并行启动多个 Sub-Agent（实际生产优化）
results = await asyncio.gather(
    agent.arun(f"监控任务: {alert}"),   # 监控 Sub-Agent
    agent.arun(f"分析任务: {alert}"),   # 分析 Sub-Agent（若不依赖监控结果）
)
```

当各子任务相互独立时，并行执行可显著降低总响应时间。
:::

## ✅ 本章小结

**本章依赖**：
- 依赖第4章的 **ReAct 循环**：Orchestrator 和所有 Sub-Agent 均使用 `ReActAgent` 实现
- 依赖第10章的 **CircuitBreaker**：每个 Sub-Agent 的工具注册表配置了独立的熔断器，防止处置操作失败时级联阻塞
- 依赖第11章的 **TaskTool**：Orchestrator 通过 `TaskTool` 触发 Sub-Agent，实现上下文隔离
- 依赖第12章的 **TraceLogger**：Orchestrator 层的 TraceLogger 记录跨 Agent 的协调链路

**全局知识链终点**：本章综合运用了 LLM 基础（第3章）→ ReAct 范式（第4章）→ 工具系统（第7章）→ 熔断器（第10章）→ 子代理（第11章）→ 可观测性（第12章）的完整链条，实现了一个具有生产级工程质量的多 Agent 自动化运维系统。
