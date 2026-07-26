---
title: 第11章 子代理机制
description: 掌握 TaskTool 子代理任务分发，实现 Agent 的并行执行与任务编排
---

# 第11章 子代理机制

## 🗺️ 在知识体系中的位置

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0;font-family:sans-serif;font-size:13px">
<a href="/part3-engineering/ch07-tool-system" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第7章 工具系统</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part3-engineering/ch09-session-persistence" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第9章 会话持久化</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<span style="background:#3b82f6;color:#fff;padding:6px 14px;border-radius:8px;font-weight:700;border:2px solid #1d4ed8">第11章 子代理</span>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part4-enterprise/ch15-multi-agent-system" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第15章 多Agent实战</a>
</div>

子代理机制将工具系统（第7章）和 Agent 范式（第4–6章）打通：主 Agent 通过 `TaskTool` 启动独立的子代理来处理子任务，实现上下文隔离和并行执行。第15章多 Agent 实战是本章的完整落地。

## 🎯 本章你能学到什么

- 能说明"子代理"与"工具调用"的核心区别：子代理有独立的上下文，工具只是一个函数
- 能解释 `TaskTool` 的 `tool_filter` 参数的安全意义（只读工具 vs 完全访问）
- 能理解 `return_summary=True` 为什么能防止子代理的详细历史污染主 Agent 上下文
- 能用 Java 视角理解子代理与 `ThreadPoolExecutor + Future` 的对应关系

## 📖 核心概念

### 子代理 vs 工具调用

**结论**：工具调用是**无状态的函数执行**（输入→输出），子代理是**有状态的 Agent 实例**（有独立历史、可多步推理、有自己的工具集）。

当一个子任务需要多步推理才能完成时，用工具调用会污染主 Agent 的上下文（子任务的中间推理步骤会占满 token 窗口），用子代理则能把这些细节封装在隔离的上下文中，最终只把摘要结果返回给主 Agent。

| 对比维度 | 工具调用 | 子代理（TaskTool） |
|---------|---------|----------------|
| **执行模式** | 单次函数调用 | 完整的 Agent 循环（多步推理） |
| **上下文** | 共享主 Agent 上下文 | 独立隔离的上下文 |
| **返回值** | 完整的工具输出 | 摘要（`return_summary=True`） |
| **适用场景** | 简单的信息查询 | 复杂的子任务（需要多步决策） |

### `TaskTool`：子代理调度工具

```python
# 来源: hello_agents/tools/builtin/task_tool.py — TaskTool 核心结构
class TaskTool(Tool):
    """子代理工具：允许主 Agent 启动隔离的子代理来处理子任务"""

    def __init__(self, agent_factory: Callable[[str], Agent],
                 tool_registry=None, config=None):
        super().__init__(
            name="Task",
            description="启动子代理处理特定的子任务，使用隔离的上下文。"
        )
        self.agent_factory = agent_factory  # 工厂函数：接受 agent_type 字符串，返回 Agent 实例
        self.tool_registry = tool_registry
        self.config = config or Config()

    def get_parameters(self) -> list:
        return [
            ToolParameter(name="task", type="string",
                         description="子任务的详细描述", required=True),
            ToolParameter(name="agent_type", type="string",
                         description="子代理类型：react/reflection/plan/simple",
                         required=False, default="react"),
            ToolParameter(name="tool_filter", type="string",
                         description="工具过滤：readonly/full/none",
                         required=False, default="none"),
            ToolParameter(name="max_steps", type="integer",
                         description="最大步数限制", required=False),
        ]
```

::: tip ⚙️ 工程技巧：`agent_factory` ≈ Spring 的 `PrototypeBean`

`agent_factory` 是一个工厂函数，每次调用返回**新的 Agent 实例**（独立上下文）。这等价于 Spring 中的 `@Scope("prototype")` Bean——每次 `getBean()` 都返回全新实例，而不是共享的 Singleton。如果子代理复用主 Agent 的实例，子任务的历史会污染主 Agent 的上下文，造成"上下文泄漏"。工厂模式天然解决了这个问题。
:::

### 工具过滤器：安全隔离

```python
# 来源: hello_agents/tools/builtin/task_tool.py — _create_tool_filter 方法
def _create_tool_filter(self, filter_type: str):
    """根据类型创建工具过滤器，控制子代理的权限边界"""
    if filter_type == "readonly":
        return ReadOnlyFilter()    # 子代理只能使用只读工具（查询类），不能执行写操作
    elif filter_type == "full":
        return FullAccessFilter()  # 子代理可使用所有工具
    elif filter_type == "none":
        return None                # 不过滤（默认）
```

::: tip ⚙️ 工程技巧：`tool_filter` ≈ Spring Security 的方法级安全

`tool_filter` 给子代理设置"权限边界"，等价于 Spring Security 的 `@PreAuthorize("hasRole('READONLY')")`。当子代理负责数据分析子任务时，应使用 `readonly` 过滤器，防止它意外触发写操作（如删除文件、修改数据库）。这是最小权限原则在 Agent 系统中的落地。
:::

### 执行流程：任务分发 + 摘要返回

```python
# 来源: hello_agents/tools/builtin/task_tool.py — run 方法
def run(self, parameters: Dict[str, Any]) -> ToolResponse:
    task = parameters.get("task", "")
    agent_type = parameters.get("agent_type", "react").lower()
    tool_filter_type = parameters.get("tool_filter", "none").lower()
    max_steps = parameters.get("max_steps")

    # 1. 用工厂创建新的子代理实例（独立上下文）
    subagent = self.agent_factory(agent_type)
    tool_filter = self._create_tool_filter(tool_filter_type)

    # 2. 以"子代理模式"运行（return_summary=True 防止历史污染主上下文）
    result = subagent.run_as_subagent(
        task=task,
        tool_filter=tool_filter,
        return_summary=True,      # 只返回摘要，不返回详细历史
        max_steps_override=max_steps
    )

    # 3. 封装为 ToolResponse 返回给主 Agent
    if result["success"]:
        return ToolResponse.success(
            text=f"[SubAgent-{agent_type}] 任务完成\n\n{result['summary']}",
            data={"agent_type": agent_type, "task": task, **result["metadata"]}
        )
    else:
        return ToolResponse.partial(
            text=f"[SubAgent-{agent_type}] 任务未完全完成\n\n{result['summary']}",
            data=result["metadata"]
        )
```

## 💻 代码实战

```python
# 来源: hello_agents/tools/builtin/task_tool.py (TaskTool)
# 来源: hello_agents/agents/react_agent.py (ReActAgent)
# 来源: hello_agents/core/llm.py (HelloAgentsLLM)
from hello_agents.tools.builtin.task_tool import TaskTool
from hello_agents.tools.registry import ToolRegistry
from hello_agents.agents.react_agent import ReActAgent
from hello_agents.core.llm import HelloAgentsLLM


def build_multi_agent_system():
    """构建主 Agent + 子代理系统"""
    llm = HelloAgentsLLM()

    # 定义子代理工厂（每次调用返回新实例）
    def agent_factory(agent_type: str):
        if agent_type == "react":
            return ReActAgent(name=f"sub-react-{id(object())}", llm=llm, max_steps=5)
        raise ValueError(f"不支持的 agent_type: {agent_type}")

    # 创建 TaskTool
    task_tool = TaskTool(agent_factory=agent_factory)

    # 创建主 Agent 的工具注册表，包含 TaskTool
    main_registry = ToolRegistry()
    main_registry.register_tool(task_tool)

    # 主 Agent：负责任务拆分和协调
    main_agent = ReActAgent(
        name="orchestrator",
        llm=llm,
        tool_registry=main_registry,
        system_prompt=(
            "你是一个任务协调 Agent。收到复杂任务后，"
            "将其拆分为独立子任务，用 Task 工具分发给子代理处理，"
            "再汇总结果给出最终回答。"
        ),
        max_steps=10
    )
    return main_agent


if __name__ == "__main__":
    agent = build_multi_agent_system()
    result = agent.run("分别分析 order-service 和 payment-service 的代码质量，并给出综合改进建议")
    print(result)
```

## 🏢 企业场景落地

在 Java 后端系统中，并行数据抓取是常见场景：需要从多个 API 或数据库聚合数据，各个数据源互相独立，天然适合并行。`TaskTool` 让主 Agent 能把这些独立子任务分发给子代理，各子代理独立执行后汇总结果。

```python
# 来源依赖: hello_agents/tools/builtin/task_tool.py (TaskTool)
# 来源依赖: hello_agents/agents/react_agent.py (ReActAgent)
# 来源依赖: hello_agents/tools/registry.py (ToolRegistry)
# 企业场景：并行数据抓取子代理组
import asyncio
from hello_agents.tools.builtin.task_tool import TaskTool
from hello_agents.tools.registry import ToolRegistry
from hello_agents.agents.react_agent import ReActAgent
from hello_agents.tools.base import tool_action
from hello_agents.core.llm import HelloAgentsLLM


# 定义数据抓取工具（模拟实际 API 调用）
@tool_action(name="fetch_order_stats", description="获取订单统计数据")
def fetch_order_stats(date_range: str) -> str:
    return f"[{date_range}] 订单总量: 1,234 笔，金额: ¥456,789，完成率: 87%"


@tool_action(name="fetch_user_stats", description="获取用户活跃数据")
def fetch_user_stats(date_range: str) -> str:
    return f"[{date_range}] 活跃用户: 8,901 人，新增: 234 人，流失: 89 人"


@tool_action(name="fetch_service_health", description="获取服务健康状态")
def fetch_service_health(service_name: str) -> str:
    return f"{service_name}: UP (延迟 45ms, 错误率 0.12%)"


def create_data_aggregation_orchestrator() -> ReActAgent:
    """创建数据聚合主 Agent"""
    llm = HelloAgentsLLM()

    # 子代理工具注册表（包含数据抓取工具）
    sub_registry = ToolRegistry()
    sub_registry.register_function(fetch_order_stats)
    sub_registry.register_function(fetch_user_stats)
    sub_registry.register_function(fetch_service_health)

    def agent_factory(agent_type: str):
        return ReActAgent(
            name=f"data-collector-{id(object())}",
            llm=llm,
            tool_registry=sub_registry,
            max_steps=3
        )

    # 主 Agent 只有 TaskTool，负责调度
    main_registry = ToolRegistry()
    main_registry.register_tool(TaskTool(agent_factory=agent_factory))

    return ReActAgent(
        name="data-aggregator",
        llm=llm,
        tool_registry=main_registry,
        system_prompt=(
            "你是数据聚合协调者。收到报告请求后，"
            "用 Task 工具并行启动子代理分别获取：订单数据、用户数据、服务健康状态，"
            "最后汇总成完整的日报。"
        ),
        max_steps=8
    )


if __name__ == "__main__":
    orchestrator = create_data_aggregation_orchestrator()
    report = orchestrator.run("生成今日业务日报，包含订单、用户和服务状态")
    print("=== 今日业务日报 ===")
    print(report)
```

::: details ☕ Java 对比：`TaskTool` vs `ThreadPoolExecutor + Future`

```python
# Python：TaskTool 串行启动子代理（ReActAgent 内部可 async 并行）
task_tool.run({"task": "获取订单数据", "agent_type": "react"})
task_tool.run({"task": "获取用户数据", "agent_type": "react"})
```

```java
// Java：ExecutorService 并行 Future，等价于并行子代理
ExecutorService pool = Executors.newFixedThreadPool(4);
Future<String> orderFuture = pool.submit(() -> fetchOrderStats("today"));
Future<String> userFuture  = pool.submit(() -> fetchUserStats("today"));

String orderResult = orderFuture.get();  // 阻塞等待
String userResult  = userFuture.get();
pool.shutdown();
```

核心对应：子代理 ≈ `Callable` 任务；`TaskTool` ≈ `ExecutorService.submit()`；`return_summary` ≈ `Future.get()` 只返回最终结果而非中间状态。
:::

## ✅ 本章小结

**本章依赖**：
- 依赖第7章的 **`Tool` 基类和 `ToolRegistry`**：`TaskTool` 本身就是一个 `Tool`，注册到主 Agent 的 `ToolRegistry` 中
- 依赖第4章的 **`ReActAgent`**：子代理的默认类型就是 `ReActAgent`，子代理的执行流程与第4章完全相同

**后续应用**：
- 本章的 **`TaskTool` + `agent_factory` 模式**在第15章多 Agent 监控系统中得到完整应用：多个专职子代理（监控、分析、处置）由主 Orchestrator 通过 `TaskTool` 调度
