---
title: 第10章 熔断器
description: 理解熔断器状态机，用 CircuitBreaker 保护 Agent 工具调用的稳定性
---

# 第10章 熔断器

## 🗺️ 在知识体系中的位置

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0;font-family:sans-serif;font-size:13px">
<a href="/part3-engineering/ch07-tool-system" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第7章 工具系统</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<span style="background:#3b82f6;color:#fff;padding:6px 14px;border-radius:8px;font-weight:700;border:2px solid #1d4ed8">第10章 熔断器</span>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part3-engineering/ch11-sub-agent" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第11章 子代理</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part4-enterprise/ch13-api-gateway-agent" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第13章 API网关实战</a>
</div>

第7章展示了 `ToolRegistry` 内置了 `CircuitBreaker`，本章深入这个熔断器的工作原理。理解状态机设计后，第13章和第15章企业实战将完整应用熔断器保护外部服务调用。

## 🎯 本章你能学到什么

- 能用状态机图描述 CircuitBreaker 的三态转换：Closed → Open → Closed（恢复）
- 能从 `circuit_breaker.py` 源码中识别 `failure_threshold` 和 `recovery_timeout` 的具体作用
- 能说明为什么 HelloAgents 用 `defaultdict(int)` 存储失败计数，以及其 Java 等价
- 能解释为什么熔断器是防止 Agent 陷入"死亡螺旋"的关键工程组件

## 📖 核心概念

### 为什么 Agent 需要熔断器

**结论**：Agent 的工具调用是对外部服务的依赖。当外部服务不可用时，没有熔断器的 Agent 会不断重试失败的工具调用，消耗大量 API 调用配额（token 费用），最终在 `max_steps` 耗尽后无功而返。熔断器在检测到连续失败后，主动"断路"，避免这种资源浪费。

这在 Java 微服务中是一个经典场景：服务 A 依赖服务 B，服务 B 宕机后，没有熔断保护的服务 A 会把所有线程卡在等待 B 的响应上，最终导致服务 A 也宕机——即"雪崩效应"。Resilience4j 正是为此而生。

### 状态机：Closed → Open → Closed

```python
# 来源: hello_agents/tools/circuit_breaker.py — CircuitBreaker 状态机
class CircuitBreaker:
    """
    状态机：
    Closed（正常）→ 连续失败 ≥ threshold → Open（熔断）→ timeout 后 → Closed（恢复）
    """

    def __init__(self, failure_threshold: int = 3, recovery_timeout: int = 300, enabled: bool = True):
        self.failure_threshold = failure_threshold  # 连续失败 3 次触发熔断
        self.recovery_timeout = recovery_timeout    # 熔断 300 秒（5分钟）后自动恢复
        self.enabled = enabled

        # 存储每个工具的失败计数
        self.failure_counts: Dict[str, int] = defaultdict(int)
        # 存储熔断开启的时间戳（存在 = Open 状态，不存在 = Closed 状态）
        self.open_timestamps: Dict[str, float] = {}
```

```python
# 来源: hello_agents/tools/circuit_breaker.py — is_open 方法（状态检查）
def is_open(self, tool_name: str) -> bool:
    """检查工具是否处于 Open（熔断）状态"""
    if not self.enabled:
        return False
    if tool_name not in self.open_timestamps:
        return False  # 不在 open_timestamps 里 = Closed 状态

    # 检查是否已过恢复时间
    open_time = self.open_timestamps[tool_name]
    if time.time() - open_time > self.recovery_timeout:
        self.close(tool_name)  # 自动恢复：Open → Closed
        return False

    return True  # 还在熔断窗口内
```

::: tip ⚙️ 工程技巧：`defaultdict(int)` ≈ `ConcurrentHashMap + AtomicInteger`

`defaultdict(int)` 在访问不存在的 key 时自动初始化为 `0`，省去了 `if key not in dict: dict[key] = 0` 的样板代码。Java 等价实现：

```java
ConcurrentHashMap<String, AtomicInteger> failureCounts = new ConcurrentHashMap<>();
// 等价于 defaultdict(int) 的自动初始化 + 线程安全累加
failureCounts.computeIfAbsent("tool_name", k -> new AtomicInteger(0)).incrementAndGet();
```

Python 的 `defaultdict` 不是线程安全的，但 Agent 的工具调用通常在单线程事件循环中执行（AsyncIO），不需要并发保护。生产环境如果需要多线程，应换用线程安全的实现。
:::

### 失败记录与状态转换

```python
# 来源: hello_agents/tools/circuit_breaker.py — record_result 和 _on_failure
def record_result(self, tool_name: str, response: ToolResponse):
    """记录工具执行结果，驱动状态机转换"""
    if not self.enabled:
        return
    is_error = response.status == ToolStatus.ERROR  # 基于 ToolResponse.status 判断
    if is_error:
        self._on_failure(tool_name)
    else:
        self._on_success(tool_name)  # 成功则重置计数

def _on_failure(self, tool_name: str):
    """失败处理：增加计数，检查是否触发熔断"""
    self.failure_counts[tool_name] += 1
    if self.failure_counts[tool_name] >= self.failure_threshold:
        self.open_timestamps[tool_name] = time.time()  # 记录熔断开始时间
        print(f"🔴 Circuit Breaker: 工具 '{tool_name}' 已熔断（连续 {self.failure_counts[tool_name]} 次失败）")

def _on_success(self, tool_name: str):
    """成功处理：重置失败计数（Closed 状态下的正常流程）"""
    self.failure_counts[tool_name] = 0
```

### 熔断后的 Agent 行为

```python
# 来源: hello_agents/tools/registry.py — execute_tool 熔断判断（已在第7章展示）
def execute_tool(self, name: str, input_text: str) -> ToolResponse:
    if self.circuit_breaker.is_open(name):
        status = self.circuit_breaker.get_status(name)
        return ToolResponse.error(
            code="CIRCUIT_OPEN",
            message=f"工具 '{name}' 当前被禁用。{status['recover_in_seconds']} 秒后可用。"
        )
    # 执行工具 + 记录结果...
```

当 Agent 收到 `CIRCUIT_OPEN` 错误时，LLM 会读到错误消息（`x 秒后可用`），从而可能决定等待或切换到备用策略，而不是继续盲目重试。

## 💻 代码实战

```python
# 来源: hello_agents/tools/circuit_breaker.py (CircuitBreaker)
# 来源: hello_agents/tools/response.py (ToolResponse, ToolStatus)
from hello_agents.tools.circuit_breaker import CircuitBreaker
from hello_agents.tools.response import ToolResponse, ToolStatus

# 初始化：连续失败 2 次触发熔断，60 秒后自动恢复
cb = CircuitBreaker(failure_threshold=2, recovery_timeout=60)

# 模拟工具调用场景
tool_name = "external_api"

# 第 1 次调用失败
cb.record_result(tool_name, ToolResponse.error("TIMEOUT", "连接超时"))
print(f"失败后状态: {cb.get_status(tool_name)}")
# {"state": "closed", "failure_count": 1}

# 第 2 次调用失败 → 触发熔断
cb.record_result(tool_name, ToolResponse.error("TIMEOUT", "连接超时"))
print(f"熔断后状态: {cb.get_status(tool_name)}")
# {"state": "open", "failure_count": 2, "recover_in_seconds": 59}

# 尝试调用时被拒绝
if cb.is_open(tool_name):
    print("工具已熔断，跳过此次调用")

# 成功调用后重置
cb.record_result(tool_name, ToolResponse.success(text="成功"))
# 注意：如果处于 Open 状态，成功也不会立即关闭熔断，需等待 recovery_timeout
```

## 🏢 企业场景落地

在 Java 后端系统中，外部 API（如支付网关、短信服务、天气 API）不可用是常态。Agent 调用这类工具时，如果没有熔断保护，一次外部服务故障会导致 Agent 的所有步骤都阻塞在同一个失败的工具调用上，耗尽 `max_steps`。

下面展示一个完整的外部 API 熔断防雪崩示例：

```python
# 来源依赖: hello_agents/tools/circuit_breaker.py (CircuitBreaker)
# 来源依赖: hello_agents/tools/base.py (Tool, ToolParameter)
# 来源依赖: hello_agents/tools/response.py (ToolResponse)
# 来源依赖: hello_agents/tools/registry.py (ToolRegistry)
# 企业场景：外部 API 熔断防雪崩
import urllib.request
import json
from hello_agents.tools.base import Tool, ToolParameter
from hello_agents.tools.response import ToolResponse
from hello_agents.tools.circuit_breaker import CircuitBreaker
from hello_agents.tools.registry import ToolRegistry
from hello_agents.agents.react_agent import ReActAgent
from hello_agents.core.llm import HelloAgentsLLM


class ExternalPaymentApiTool(Tool):
    """外部支付 API 工具，模拟不稳定的第三方服务"""

    def __init__(self, api_url: str, timeout: int = 3):
        super().__init__(
            name="query_payment_status",
            description="查询支付订单状态，调用第三方支付网关 API"
        )
        self.api_url = api_url
        self.timeout = timeout

    def get_parameters(self) -> list:
        return [
            ToolParameter(name="order_id", type="string",
                         description="支付订单号", required=True)
        ]

    def run(self, parameters: dict) -> ToolResponse:
        order_id = parameters.get("order_id", "")
        try:
            url = f"{self.api_url}/payment/{order_id}/status"
            with urllib.request.urlopen(url, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode())
                return ToolResponse.success(
                    text=f"订单 {order_id} 支付状态: {data.get('status', 'UNKNOWN')}",
                    data=data
                )
        except Exception as e:
            # 超时或网络错误 → ERROR 状态 → 触发熔断器计数
            return ToolResponse.error(
                code="API_UNAVAILABLE",
                message=f"支付网关不可用: {str(e)}。请稍后重试或使用备用查询方式。"
            )


def create_order_agent_with_circuit_breaker():
    """创建带熔断器保护的订单处理 Agent"""
    # 配置熔断器：2次失败触发熔断，30秒恢复
    cb = CircuitBreaker(failure_threshold=2, recovery_timeout=30)
    registry = ToolRegistry(circuit_breaker=cb)
    registry.register_tool(ExternalPaymentApiTool(api_url="https://payment-api.example.com"))

    return ReActAgent(
        name="order-agent",
        llm=HelloAgentsLLM(),
        tool_registry=registry,
        system_prompt=(
            "你是订单处理助手。如果支付查询工具被熔断，"
            "请建议用户通过人工客服渠道查询，而非继续重试。"
        ),
        max_steps=5
    )


if __name__ == "__main__":
    agent = create_order_agent_with_circuit_breaker()
    result = agent.run("查询订单 ORD-20240115-888 的支付状态")
    print(result)
    # 当支付网关不可用时，Agent 会在 2 次失败后收到 CIRCUIT_OPEN 错误，
    # 然后 LLM 根据错误信息决定转向备用处理策略，而非无限重试
```

## ✅ 本章小结

**本章依赖**：
- 依赖第7章的 `ToolRegistry.execute_tool`：熔断器集成在 `execute_tool` 中，本章是对该集成点的深度拆解
- 依赖第7章的 `ToolResponse.status`（ERROR/PARTIAL/SUCCESS）：熔断器通过判断 `status == ToolStatus.ERROR` 来决定是否增加失败计数

**后续应用**：
- 本章的 **熔断器 + ToolRegistry 组合**在第13章 API 网关实战中用于保护多个后端服务的路由调用
- 本章的 `failure_threshold` 和 `recovery_timeout` 配置思想在第15章多 Agent 实战中延伸：不同的子代理工具可以配置不同的熔断阈值，实现细粒度的弹性控制
