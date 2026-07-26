---
title: 第3章 LLM 基础
description: 掌握 LLM 消息协议、invoke/ainvoke 接口，为 Agent 开发打好基础
---

# 第3章 LLM 基础

## 🗺️ 在知识体系中的位置

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0;font-family:sans-serif;font-size:13px">
  <a href="/part1-foundation/ch01-what-is-agent" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none;transition:background 0.2s">第1–2章 基础认知</a>
  <span style="color:#94a3b8;font-size:16px">→</span>
  <span style="background:#3b82f6;color:#fff;padding:6px 14px;border-radius:8px;font-weight:700;border:2px solid #1d4ed8">📍 第3章 LLM 基础</span>
  <span style="color:#94a3b8;font-size:16px">→</span>
  <a href="/part2-paradigms/ch04-react" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none;transition:background 0.2s">第4章 ReAct</a>
  <span style="color:#94a3b8;font-size:16px">→</span>
  <a href="/part2-paradigms/ch05-plan-solve" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none;transition:background 0.2s">第5章 Plan-Solve</a>
  <span style="color:#94a3b8;font-size:16px">→</span>
  <a href="/part2-paradigms/ch06-reflection" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none;transition:background 0.2s">第6章 Reflection</a>
</div>

本章承接第2章关于 LLM Agent 的历史定位，深入 `HelloAgentsLLM` 的接口设计，掌握消息协议和同步/异步调用方式。第4–6章所有范式都以本章的 LLM 接口为基础。

## 🎯 本章你能学到什么

- 能说明 OpenAI 消息协议的四种角色（system/user/assistant/tool）及其在 Agent 中的作用
- 能区分 `invoke`（同步）、`ainvoke`（异步）、`invoke_with_tools`（Function Calling）三个接口的使用场景
- 能读懂 `LLMResponse` 和 `LLMToolResponse` 两个响应对象的字段含义
- 能用 Java 视角理解 `async/await` 协程模型与 `CompletableFuture` 的本质差异

## 📖 核心概念

### 消息协议：LLM 的"HTTP 请求格式"

**结论**：与 LLM 交互的核心是一个消息列表（`List[Dict]`），每条消息有固定的 `role` 字段，LLM 根据消息历史推理出下一步输出。

OpenAI 消息协议定义了四种角色：

| role | 作用 | Java 类比 |
|------|------|-----------|
| `system` | 设定 Agent 角色、行为规范和约束 | `@Configuration` 中的全局配置 |
| `user` | 当前用户的输入或提问 | HTTP 请求 Body |
| `assistant` | LLM 上一轮的输出（含工具调用请求） | HTTP 响应 Body |
| `tool` | 工具函数的执行结果 | 数据库/第三方 API 的回调结果 |

在 Agent 循环中，`messages` 列表不断追加，构成完整的"对话上下文"。LLM 每次都看到全部历史，从而能保持一致的推理状态。

### `HelloAgentsLLM`：统一 LLM 客户端

**结论**：`HelloAgentsLLM` 通过适配器模式（Adapter Pattern）屏蔽了 OpenAI、Anthropic、Gemini 等不同 API 的差异，提供统一接口。

```python
# 来源: hello_agents/core/llm.py
class HelloAgentsLLM:
    def __init__(
        self,
        model: Optional[str] = None,    # 默认从 LLM_MODEL_ID 环境变量读取
        api_key: Optional[str] = None,  # 默认从 LLM_API_KEY 环境变量读取
        base_url: Optional[str] = None, # 默认从 LLM_BASE_URL 环境变量读取
        temperature: float = 0.7,       # 生成随机性，0=确定性，1=最大随机
        timeout: Optional[int] = None,  # 默认从 LLM_TIMEOUT 读取，默认 60 秒
        **kwargs
    ):
        # 创建适配器（自动检测 base_url 判断是 OpenAI/Anthropic/Gemini）
        self._adapter: BaseLLMAdapter = create_adapter(
            api_key=self.api_key,
            base_url=self.base_url,
            timeout=self.timeout,
            model=self.model
        )
```

::: tip ⚙️ 工程技巧：适配器模式 ≈ Spring 的 `DataSource` 抽象

`HelloAgentsLLM` 的设计与 Spring 的数据库连接池抽象完全类似：`DataSource` 屏蔽了 MySQL/PostgreSQL/Oracle 的差异，应用代码只调用 `getConnection()`。`HelloAgentsLLM` 屏蔽了 OpenAI/Anthropic/Gemini 的差异，Agent 代码只调用 `invoke()`。切换 LLM 提供商只需改环境变量，业务代码零改动。
:::

### 三个核心调用接口

**`invoke`：同步调用，返回完整响应**

```python
# 来源: hello_agents/core/llm.py
def invoke(self, messages: List[Dict[str, str]], **kwargs) -> LLMResponse:
    """非流式调用 LLM，返回完整响应对象。"""
    call_kwargs = {
        "temperature": kwargs.pop("temperature", self.temperature),
    }
    return self._adapter.invoke(messages, **call_kwargs)
    # 返回 LLMResponse(content, model, usage, latency_ms, reasoning_content)
```

**`ainvoke`：异步调用，在协程中使用**

```python
# 来源: hello_agents/core/llm.py
async def ainvoke(self, messages: List[Dict[str, str]], **kwargs) -> LLMResponse:
    """异步非流式调用：在线程池中运行同步 invoke，避免阻塞事件循环"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        lambda: self.invoke(messages, **kwargs)  # 将同步调用包装为异步
    )
```

::: details ☕ Java 对比：`async/await` vs `CompletableFuture`

Python 的 `async def` 定义协程函数，`await` 暂停当前协程等待 IO 完成，不阻塞线程。Java 的 `CompletableFuture` 基于线程池实现异步，通过 `.thenApply()` 链式组合。

```python
# Python：await 暂停协程，释放事件循环给其他任务
async def run_agent(query: str) -> str:
    response = await llm.ainvoke([{"role": "user", "content": query}])
    return response.content
```

```java
// Java 等价：CompletableFuture 异步链
public CompletableFuture<String> runAgent(String query) {
    return llmClient.invokeAsync(List.of(Map.of("role", "user", "content", query)))
        .thenApply(response -> response.getContent());
}
```

核心差异：Python 协程是**单线程协作式**调度，`await` 主动让出控制权；Java `CompletableFuture` 默认使用 `ForkJoinPool` **多线程并行**，`.thenApply()` 是回调，不是暂停。
:::

**`invoke_with_tools`：Function Calling 接口**

```python
# 来源: hello_agents/core/llm.py
def invoke_with_tools(
    self,
    messages: List[Dict],
    tools: List[Dict],        # 工具的 JSON Schema 列表
    tool_choice: Union[str, Dict] = "auto",  # "auto"/"none"/"required"
    **kwargs
) -> LLMToolResponse:
    """调用 LLM 并支持工具调用（Function Calling）"""
    call_kwargs = {
        "temperature": kwargs.pop("temperature", self.temperature),
        "tool_choice": tool_choice,
    }
    return self._adapter.invoke_with_tools(messages, tools, **call_kwargs)
```

### 响应对象：`LLMResponse` 与 `LLMToolResponse`

```python
# 来源: hello_agents/core/llm_response.py
@dataclass
class LLMResponse:
    content: str            # LLM 的文本回复
    model: str              # 实际使用的模型名称（如 "gpt-4o"）
    usage: Dict[str, int]   # token 统计：prompt_tokens/completion_tokens/total_tokens
    latency_ms: int = 0     # 调用耗时（毫秒），用于性能监控
    reasoning_content: Optional[str] = None  # thinking model 的推理过程（o1/deepseek-r1）

@dataclass
class LLMToolResponse:
    content: Optional[str]      # 文本回复（可能为 None，当 LLM 选择调用工具时）
    tool_calls: List[ToolCall]  # LLM 要求调用的工具列表
    model: str
    usage: Dict[str, int]
    latency_ms: int = 0

@dataclass
class ToolCall:
    id: str         # 工具调用的唯一 ID（用于对应 tool role 消息）
    name: str       # 工具函数名称
    arguments: str  # JSON 字符串格式的参数（需 json.loads() 解析）
```

::: details ☕ Java 对比：`@dataclass` vs `@Data (Lombok)`

```python
# Python：@dataclass 自动生成 __init__、__repr__、__eq__
from dataclasses import dataclass, field
@dataclass
class LLMResponse:
    content: str
    model: str
    usage: dict = field(default_factory=dict)  # 可变默认值必须用 field
```

```java
// Java 等价：Lombok @Data + @Builder
@Data
@Builder
public class LLmResponse {
    private String content;
    private String model;
    @Builder.Default
    private Map<String, Integer> usage = new HashMap<>();
}
```

Python `@dataclass` 在类定义时立即生成方法；Java `@Data` 在编译期由注解处理器生成字节码。两者都解决"样板代码"问题，但 Python 是运行时，Java 是编译时。
:::

## 💻 代码实战

下面展示如何初始化 `HelloAgentsLLM` 并分别调用三个核心接口：

```python
# 来源: hello_agents/core/llm.py + hello_agents/core/llm_response.py
# 基础用法：初始化 LLM 客户端
from hello_agents.core.llm import HelloAgentsLLM

# 从环境变量读取配置（.env 文件中设置 LLM_MODEL_ID/LLM_API_KEY/LLM_BASE_URL）
llm = HelloAgentsLLM()

# 同步调用：适合脚本、测试环境
messages = [
    {"role": "system", "content": "你是一个 Java 后端开发助手"},
    {"role": "user",   "content": "什么是 CompletableFuture？"}
]
response = llm.invoke(messages)
print(response.content)      # 文本回复
print(response.latency_ms)   # 耗时，单位毫秒
print(response.usage)        # {"prompt_tokens": 25, "completion_tokens": 120, ...}
```

```python
# 来源: hello_agents/core/llm.py
# Function Calling 调用：Agent 用这个接口让 LLM 选择工具
import json

tools = [{
    "type": "function",
    "function": {
        "name": "query_database",
        "description": "查询数据库中的记录",
        "parameters": {
            "type": "object",
            "properties": {
                "sql": {"type": "string", "description": "SQL 查询语句"}
            },
            "required": ["sql"]
        }
    }
}]

tool_response = llm.invoke_with_tools(
    messages=[{"role": "user", "content": "查询最近一小时的告警记录"}],
    tools=tools,
    tool_choice="auto"  # 让 LLM 自己决定是否调用工具
)

if tool_response.tool_calls:
    tc = tool_response.tool_calls[0]
    print(tc.name)                       # "query_database"
    args = json.loads(tc.arguments)      # {"sql": "SELECT * FROM alerts WHERE ..."}
    print(args["sql"])
```

## 🏢 企业场景落地

在 Java 后端系统中，API 网关是一个典型的决策枢纽：根据请求特征（路径、Header、业务标识）路由到不同的后端服务。传统网关用硬编码路由规则，LLM Agent 可以让网关具备"理解请求意图"的能力。

下面展示一个基于 `HelloAgentsLLM` 的 API 网关路由决策 Agent 骨架：

```python
# 来源依赖: hello_agents/core/llm.py (HelloAgentsLLM, invoke_with_tools)
# 企业场景：API 网关智能路由 Agent 骨架
import json
import asyncio
from hello_agents.core.llm import HelloAgentsLLM

class ApiGatewayRoutingAgent:
    """
    API 网关智能路由 Agent
    根据请求的自然语言描述或业务上下文，决策路由到哪个后端微服务。
    在 Java 后端架构中，这相当于 Zuul/Gateway 的路由规则 + 业务逻辑的智能合并层。
    """

    def __init__(self):
        self.llm = HelloAgentsLLM()  # 从环境变量读取配置
        self.routing_tools = [{
            "type": "function",
            "function": {
                "name": "route_to_service",
                "description": "将请求路由到指定的后端微服务",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "service_name": {
                            "type": "string",
                            "enum": ["user-service", "order-service", "payment-service",
                                     "inventory-service", "notification-service"],
                            "description": "目标微服务名称"
                        },
                        "reason": {
                            "type": "string",
                            "description": "路由决策的原因"
                        }
                    },
                    "required": ["service_name", "reason"]
                }
            }
        }]

    async def route(self, request_context: dict) -> dict:
        """
        根据请求上下文决策路由目标
        request_context: {"path": "/api/checkout", "user_id": "u123", "body": {...}}
        """
        messages = [
            {
                "role": "system",
                "content": "你是一个 API 网关路由决策助手，根据请求上下文选择最合适的后端微服务。"
            },
            {
                "role": "user",
                "content": f"请为以下请求决定路由目标：\n{json.dumps(request_context, ensure_ascii=False)}"
            }
        ]
        response = await self.llm.ainvoke_with_tools(
            messages=messages,
            tools=self.routing_tools,
            tool_choice="required"  # 强制输出路由结果
        )
        if response.tool_calls:
            result = json.loads(response.tool_calls[0].arguments)
            return result
        return {"service_name": "default-service", "reason": "无法解析路由"}

if __name__ == "__main__":
    agent = ApiGatewayRoutingAgent()
    ctx = {"path": "/api/checkout", "user_id": "u123", "action": "完成订单支付"}
    result = asyncio.run(agent.route(ctx))
    print(f"路由到: {result['service_name']} — 原因: {result['reason']}")
```

## ✅ 本章小结

**本章依赖**：
- 依赖第2章的 **LLM Agent = LLM 大脑 + Function Calling 行动能力**：本章将这个结论具体落地为 `invoke_with_tools` 接口的使用方式

**后续应用**：
- 本章的 **`invoke_with_tools` 接口**在第4章 ReAct 中被用于驱动 Thought/Finish 工具调用循环，是 ReAct 范式的直接底层
- 本章的 **`ainvoke` 异步接口**在第5章 Plan-Solve 的流式执行和第6章 Reflection 的迭代优化中被大量使用
- 本章的 **消息协议（role: tool）**在第7章工具系统中得到完整实现：工具调用结果以 `tool` 角色消息的形式反馈给 LLM
- 本章的 **`LLMResponse.latency_ms` 和 `usage`**在第12章可观测性中被 TraceLogger 采集，成为性能分析的原始数据
