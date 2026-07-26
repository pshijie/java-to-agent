---
title: 第13章 API 网关 Agent 实战
description: 综合运用 ReAct + ToolRegistry + CircuitBreaker + TraceLogger，构建 API 网关智能路由 Agent
---

# 第13章 API 网关 Agent 实战

## 🗺️ 在知识体系中的位置

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0;font-family:sans-serif;font-size:13px">
<a href="/part2-paradigms/ch04-react" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第4章 ReAct</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part3-engineering/ch10-circuit-breaker" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第10章 熔断器</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part3-engineering/ch12-observability" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第12章 可观测性</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<span style="background:#3b82f6;color:#fff;padding:6px 14px;border-radius:8px;font-weight:700;border:2px solid #1d4ed8">第13章 API网关实战</span>
</div>

本章是 Part 4 的第一个企业实战，综合运用 Part 2–3 的所有组件：ReAct 范式驱动推理，ToolRegistry 管理工具集，CircuitBreaker 防止雪崩，TraceLogger 记录执行链路。

## 🎯 本章你能学到什么

- 能将 ReAct + ToolRegistry + CircuitBreaker + TraceLogger 组合成一个完整的生产级 Agent
- 能解释在 API 网关场景中，为什么智能路由比静态路由规则更灵活
- 能说明各组件在系统中的职责分工和初始化顺序
- 能独立扩展本章示例，增加新的路由策略工具

## 📖 核心概念

### 企业场景背景

**传统 API 网关（如 Spring Cloud Gateway）** 使用静态路由规则：`/api/orders/**` → `order-service`，规则在配置文件中硬编码。当业务规则复杂（如根据用户等级、请求负载、服务健康状态动态路由）时，规则维护成本急剧上升。

**LLM Agent 网关** 让 LLM 作为"路由决策大脑"，根据请求上下文动态决策：

- 用户 VIP 等级高 → 路由到高性能服务实例
- 下游服务出现熔断 → 自动切换到备用服务
- 请求语义分析 → 路由到最匹配的专项服务

### 组件职责分工

| 组件 | 职责 |
|------|------|
| `ReActAgent` | 推理引擎，分析请求上下文并决策路由目标 |
| `ToolRegistry` | 管理路由工具集（服务发现、健康检查、负载查询） |
| `CircuitBreaker` | 保护下游服务调用，防止不健康服务被持续路由 |
| `TraceLogger` | 记录每次路由决策的完整链路，支持审计和回溯 |

## 💻 代码实战

```python
# 来源: hello_agents/agents/react_agent.py (ReActAgent)
# 来源: hello_agents/tools/registry.py (ToolRegistry)
# 来源: hello_agents/tools/circuit_breaker.py (CircuitBreaker)
# 来源: hello_agents/observability/trace_logger.py (TraceLogger)
# 来源: hello_agents/tools/base.py (Tool, ToolParameter)
# 来源: hello_agents/tools/response.py (ToolResponse)
# 来源: hello_agents/core/llm.py (HelloAgentsLLM)
import json
import time
from typing import Dict, List
from hello_agents.agents.react_agent import ReActAgent
from hello_agents.tools.registry import ToolRegistry
from hello_agents.tools.circuit_breaker import CircuitBreaker
from hello_agents.observability.trace_logger import TraceLogger
from hello_agents.tools.base import Tool, ToolParameter
from hello_agents.tools.response import ToolResponse
from hello_agents.core.llm import HelloAgentsLLM


# ─── 工具定义 ───────────────────────────────────────────────

class ServiceDiscoveryTool(Tool):
    """服务发现工具：查询微服务注册表"""

    REGISTRY = {
        "order-service":   ["http://10.0.1.1:8080", "http://10.0.1.2:8080"],
        "payment-service": ["http://10.0.2.1:8080"],
        "user-service":    ["http://10.0.3.1:8080", "http://10.0.3.2:8080"],
        "inventory-service": ["http://10.0.4.1:8080"],
    }

    def __init__(self):
        super().__init__(name="discover_service",
                         description="查询指定微服务的可用实例列表")

    def get_parameters(self) -> list:
        return [ToolParameter(name="service_name", type="string",
                              description="服务名称", required=True)]

    def run(self, parameters: dict) -> ToolResponse:
        name = parameters.get("service_name", "")
        instances = self.REGISTRY.get(name)
        if not instances:
            return ToolResponse.error("NOT_FOUND", f"服务 '{name}' 未注册")
        return ToolResponse.success(
            text=f"{name} 有 {len(instances)} 个实例: {', '.join(instances)}",
            data={"service": name, "instances": instances}
        )


class ServiceHealthTool(Tool):
    """服务健康检查工具"""

    def __init__(self):
        super().__init__(name="check_health",
                         description="检查微服务实例的健康状态和当前负载")

    def get_parameters(self) -> list:
        return [ToolParameter(name="service_name", type="string",
                              description="服务名称", required=True)]

    def run(self, parameters: dict) -> ToolResponse:
        name = parameters.get("service_name", "")
        # 模拟健康检查（实际应调用 /actuator/health）
        health_data = {
            "order-service":   {"status": "UP", "cpu": 45, "qps": 320, "p99_ms": 180},
            "payment-service": {"status": "DOWN", "cpu": 0, "error": "连接超时"},
            "user-service":    {"status": "UP", "cpu": 30, "qps": 150, "p99_ms": 90},
        }
        data = health_data.get(name, {"status": "UNKNOWN"})
        if data.get("status") == "UP":
            return ToolResponse.success(
                text=f"{name} 健康 (CPU:{data['cpu']}%, QPS:{data['qps']}, P99:{data['p99_ms']}ms)",
                data=data
            )
        elif data.get("status") == "DOWN":
            return ToolResponse.error("SERVICE_DOWN",
                                       f"{name} 不可用: {data.get('error', '未知错误')}")
        return ToolResponse.partial(text=f"{name} 状态未知", data=data)


class RouteDecisionTool(Tool):
    """路由决策执行工具：将请求路由到指定服务"""

    def __init__(self):
        super().__init__(name="execute_route",
                         description="执行路由决策，将请求转发到目标服务实例")

    def get_parameters(self) -> list:
        return [
            ToolParameter(name="service_name", type="string",
                          description="目标服务名称", required=True),
            ToolParameter(name="instance_url", type="string",
                          description="目标实例 URL", required=True),
            ToolParameter(name="reason", type="string",
                          description="路由决策原因", required=True),
        ]

    def run(self, parameters: dict) -> ToolResponse:
        service = parameters.get("service_name", "")
        url = parameters.get("instance_url", "")
        reason = parameters.get("reason", "")
        return ToolResponse.success(
            text=f"✅ 路由执行成功：请求已转发至 {service} ({url})\n原因：{reason}",
            data={"routed_to": service, "instance": url, "reason": reason}
        )


# ─── Agent 工厂 ──────────────────────────────────────────────

def create_api_gateway_agent() -> tuple:
    """创建 API 网关 Agent（返回 agent + trace_logger）"""
    llm = HelloAgentsLLM()

    # 熔断器：连续 2 次失败触发熔断，60 秒恢复
    circuit_breaker = CircuitBreaker(failure_threshold=2, recovery_timeout=60)

    # 工具注册表
    registry = ToolRegistry(circuit_breaker=circuit_breaker)
    registry.register_tool(ServiceDiscoveryTool())
    registry.register_tool(ServiceHealthTool())
    registry.register_tool(RouteDecisionTool())

    # TraceLogger：记录每次路由决策
    trace_logger = TraceLogger(output_dir="memory/traces", sanitize=True)

    # ReActAgent
    agent = ReActAgent(
        name="api-gateway-agent",
        llm=llm,
        tool_registry=registry,
        system_prompt="""你是 API 网关的智能路由决策 Agent。

处理每个路由请求时，按以下步骤操作：
1. 用 discover_service 查找目标服务的可用实例
2. 用 check_health 验证服务健康状态
3. 如果服务不健康，尝试备用服务
4. 用 execute_route 执行路由决策并说明原因

路由策略优先级：健康 > 低负载 > 响应快""",
        max_steps=8
    )
    agent.trace_logger = trace_logger
    return agent, trace_logger
```

## 🏢 企业场景落地

下面是完整的可运行示例，模拟 API 网关收到请求后的完整路由决策流程：

```python
# 完整运行示例
import json
import time
from hello_agents.agents.react_agent import ReActAgent
from hello_agents.tools.registry import ToolRegistry
from hello_agents.tools.circuit_breaker import CircuitBreaker
from hello_agents.observability.trace_logger import TraceLogger
from hello_agents.tools.base import Tool, ToolParameter
from hello_agents.tools.response import ToolResponse
from hello_agents.core.llm import HelloAgentsLLM

# （复用上方定义的 ServiceDiscoveryTool、ServiceHealthTool、RouteDecisionTool、create_api_gateway_agent）

if __name__ == "__main__":
    agent, trace_logger = create_api_gateway_agent()

    # 场景 1：正常路由请求
    print("=== 场景 1：订单查询路由 ===")
    result1 = agent.run(
        "收到请求：POST /api/v1/orders/checkout，用户 VIP 等级 3，"
        "请选择最合适的后端服务并执行路由"
    )
    print(result1)

    # 场景 2：服务降级路由（payment-service 不可用）
    print("\n=== 场景 2：支付服务降级路由 ===")
    result2 = agent.run(
        "收到请求：POST /api/v1/payments/pay，支付金额 ¥299，"
        "请检查支付服务健康状态并路由，如不可用请返回降级处理建议"
    )
    print(result2)

    # 关闭 TraceLogger，生成 HTML 报告
    trace_logger.finalize()
    print("\n✅ 路由追踪报告已生成，可用浏览器打开 HTML 文件查看完整链路")
```

## ✅ 本章小结

**本章依赖**：
- 依赖第4章的 **ReAct 循环**：`ReActAgent` 驱动路由决策的推理流程
- 依赖第7章的 **ToolRegistry**：统一管理三个路由工具，并内置熔断保护
- 依赖第10章的 **CircuitBreaker**：`check_health` 工具如果连续返回 ERROR，自动熔断
- 依赖第12章的 **TraceLogger**：记录每次路由决策的完整链路，支持生产问题回溯

**后续应用**：
- 本章的 **多工具组合模式**（发现→健康检查→决策执行）在第15章多 Agent 系统中扩展为多 Agent 协同：不同子代理负责不同的专项任务
