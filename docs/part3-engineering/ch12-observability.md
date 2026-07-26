---
title: 第12章 可观测性
description: 使用 TraceLogger 追踪 Agent 执行链路，构建生产级可观测性方案
---

# 第12章 可观测性

## 🗺️ 在知识体系中的位置

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0;font-family:sans-serif;font-size:13px">
<a href="/part3-engineering/ch07-tool-system" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第7章 工具系统</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part3-engineering/ch11-sub-agent" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第11章 子代理</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<span style="background:#3b82f6;color:#fff;padding:6px 14px;border-radius:8px;font-weight:700;border:2px solid #1d4ed8">第12章 可观测性</span>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part4-enterprise/ch13-api-gateway-agent" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第13–15章 企业实战</a>
</div>

本章是 Part 3 框架工程化的收官章节。`TraceLogger` 将之前所有组件（工具调用、熔断器触发、子代理执行）的行为记录为结构化日志，为后续的企业落地章节（第13–15章）提供可观测性基础。

## 🎯 本章你能学到什么

- 能说明 JSONL + HTML 双格式输出的设计理由（机器可读 vs 人类可读）
- 能识别 `TraceLogger` 支持的核心事件类型，并解释每种事件在 Agent 运行流中的触发时机
- 能说明 `_sanitize_event` 的脱敏规则，以及为什么 Agent 日志必须内置脱敏
- 能用 Java 视角理解 `TraceLogger` 与 SkyWalking/Micrometer 的对应关系

## 📖 核心概念

### 为什么 Agent 需要专门的可观测性

**结论**：传统的日志（`logger.info`）对 Agent 不够用。Agent 的执行链路是**动态推理+工具调用的交织流**，需要记录：LLM 每步的推理意图（Thought）、工具调用的参数（Action）、工具返回的结果（Observation）、整体性能（token、延迟）。这些信息结合起来，才能在出问题时定位根因。

类比：Java 微服务用 SkyWalking 做链路追踪，记录每个服务调用的入参、出参、耗时。`TraceLogger` 是专为 Agent 设计的"链路追踪器"。

### 双格式输出：JSONL + HTML

```python
# 来源: hello_agents/observability/trace_logger.py — __init__
class TraceLogger:
    def __init__(self, output_dir: str = "memory/traces", sanitize: bool = True, ...):
        self.session_id = self._generate_session_id()  # s-20240115-143052-a3f2

        # JSONL：机器可读，流式追加（每条事件一行 JSON）
        # 支持 jq 分析："cat trace.jsonl | jq 'select(.event=="tool_call")'"
        self.jsonl_path = self.output_dir / f"trace-{self.session_id}.jsonl"
        self.jsonl_file = open(self.jsonl_path, 'w', encoding='utf-8')

        # HTML：人类可读，内置统计面板、可折叠事件详情
        self.html_path = self.output_dir / f"trace-{self.session_id}.html"
        self.html_file = open(self.html_path, 'w', encoding='utf-8')

        self._write_html_header()  # 写入 HTML 样式和结构头部
```

::: tip ⚙️ 工程技巧：JSONL ≈ Kafka Topic 的日志格式

JSONL（JSON Lines）每行一个独立 JSON 对象，非常适合**流式追加**（不需要打开整个文件重写）和**批量分析**（可以用 `jq` 过滤特定事件，或直接用 Python `for line in file` 逐行处理）。这与 Kafka 消息格式、ELK Stack 的 Logstash 输入格式完全兼容——生产环境可以直接把 JSONL 文件发送到 Filebeat → Logstash → Elasticsearch 链路。
:::

### 核心事件类型

```python
# 来源: hello_agents/observability/trace_logger.py — log_event 方法
def log_event(self, event: str, payload: Dict[str, Any], step: Optional[int] = None):
    """记录一条事件到 JSONL 和 HTML"""
    event_obj = {
        "ts": datetime.now().isoformat(),    # 时间戳
        "session_id": self.session_id,
        "step": step,                         # ReAct 循环步骤序号
        "event": event,                       # 事件类型
        "payload": payload                    # 事件数据
    }
    # 脱敏 → 写 JSONL → 写 HTML 片段
    if self.sanitize:
        event_obj = self._sanitize_event(event_obj)
    self.jsonl_file.write(json.dumps(event_obj, ensure_ascii=False) + "\n")
    self.jsonl_file.flush()
    self._write_html_event(event_obj)
```

主要事件类型及触发时机：

| 事件类型 | 触发时机 | payload 关键字段 |
|---------|---------|----------------|
| `session_start` | Agent 开始处理任务 | `agent_name`, `input` |
| `message_written` | 用户/助手消息加入历史 | `role`, `content` |
| `model_output` | LLM 返回推理结果 | `content`, `tool_calls`, `usage.total_tokens` |
| `tool_call` | LLM 请求调用某工具 | `tool_name`, `tool_call_id`, `args` |
| `tool_result` | 工具执行完成 | `tool_name`, `status`, `result` |
| `error` | 发生异常 | `error_type`, `message` |
| `session_end` | 任务完成或超时 | `duration`, `total_steps`, `final_answer`, `status` |

### 脱敏机制

```python
# 来源: hello_agents/observability/trace_logger.py — _sanitize_value
def _sanitize_value(self, value) -> Any:
    """递归脱敏敏感信息"""
    if isinstance(value, str):
        value = re.sub(r'sk-[a-zA-Z0-9]+', 'sk-***', value)           # API Key 脱敏
        value = re.sub(r'Bearer\s+[a-zA-Z0-9_\-]+', 'Bearer ***', value)  # Bearer Token
        value = re.sub(r'(/Users/|/home/|C:\\Users\\)[^/\\]+', r'\1***', value)  # 用户路径
        return value
    elif isinstance(value, dict):
        return {k: self._sanitize_value(v) for k, v in value.items()}  # 递归处理
    elif isinstance(value, list):
        return [self._sanitize_value(item) for item in value]
    return value
```

### 统计面板与 `finalize`

```python
# 来源: hello_agents/observability/trace_logger.py — finalize + _compute_stats
def finalize(self):
    """生成最终 HTML 统计面板并关闭文件"""
    stats = self._compute_stats()  # 遍历所有事件计算统计
    self._write_html_footer(stats) # 写入 HTML 统计面板（token、工具调用次数、错误列表）
    self.jsonl_file.close()
    self.html_file.close()
    print(f"✅ Trace 已保存: JSONL={self.jsonl_path}, HTML={self.html_path}")

def _compute_stats(self) -> Dict:
    """计算统计数据：token 总量、工具调用次数、错误列表、会话时长"""
    stats = {"total_tokens": 0, "tool_calls": {}, "errors": [], ...}
    for event in self._events:
        if event["event"] == "model_output":
            stats["total_tokens"] += event["payload"].get("usage", {}).get("total_tokens", 0)
        if event["event"] == "tool_call":
            tool_name = event["payload"].get("tool_name", "unknown")
            stats["tool_calls"][tool_name] = stats["tool_calls"].get(tool_name, 0) + 1
        if event["event"] == "error":
            stats["errors"].append(event["payload"])
    return stats
```

## 💻 代码实战

```python
# 来源: hello_agents/observability/trace_logger.py (TraceLogger)
from hello_agents.observability.trace_logger import TraceLogger

# 方式 1：直接使用
logger = TraceLogger(output_dir="memory/traces", sanitize=True)

logger.log_event("session_start", {"agent_name": "api-gateway-agent", "input": "路由请求"})
logger.log_event("tool_call", {"tool_name": "route_request", "args": {"path": "/api/orders"}}, step=1)
logger.log_event("tool_result", {"tool_name": "route_request", "status": "success",
                                  "result": "路由到 order-service"}, step=1)
logger.log_event("session_end", {"duration": 1.2, "total_steps": 1,
                                  "final_answer": "已路由到 order-service", "status": "success"})
logger.finalize()

# 方式 2：上下文管理器（自动 finalize，即使发生异常）
with TraceLogger(output_dir="memory/traces") as logger:
    logger.log_event("session_start", {"agent_name": "my-agent"})
    # ... Agent 执行 ...
    logger.log_event("session_end", {"status": "success"})
# 自动调用 finalize()
```

## 🏢 企业场景落地

在 Java 后端系统中，生产环境问题定位依赖三种信号：日志（Log）、指标（Metrics）、链路追踪（Trace）。`TraceLogger` 为 Agent 系统提供了 Log + Trace 的整合方案，JSONL 文件可以直接接入 ELK Stack，HTML 文件可以直接给开发者本地调试。

```python
# 来源依赖: hello_agents/observability/trace_logger.py (TraceLogger)
# 来源依赖: hello_agents/agents/react_agent.py (ReActAgent)
# 来源依赖: hello_agents/tools/registry.py (ToolRegistry)
# 企业场景：生产环境 Agent 问题定位
from hello_agents.observability.trace_logger import TraceLogger
from hello_agents.agents.react_agent import ReActAgent
from hello_agents.tools.registry import ToolRegistry
from hello_agents.tools.base import tool_action
from hello_agents.core.llm import HelloAgentsLLM


@tool_action(name="query_slow_sql", description="查询慢 SQL 记录")
def query_slow_sql(threshold_ms: int = 1000) -> str:
    """模拟查询慢 SQL 监控系统"""
    return f"发现 3 条慢查询（>{threshold_ms}ms）：SELECT * FROM orders WHERE status='pending' (2300ms)"


@tool_action(name="get_thread_dump", description="获取 JVM 线程 dump")
def get_thread_dump(service_name: str) -> str:
    return f"{service_name}: 120/200 线程活跃，发现 15 个线程等待数据库锁"


def create_production_debug_agent() -> ReActAgent:
    """创建生产问题排查 Agent，带完整的 TraceLogger"""
    llm = HelloAgentsLLM()

    # 初始化 TraceLogger（生产环境输出到统一日志目录）
    trace_logger = TraceLogger(
        output_dir="memory/traces",
        sanitize=True,  # 生产环境必须开启脱敏
    )

    registry = ToolRegistry()
    registry.register_function(query_slow_sql)
    registry.register_function(get_thread_dump)

    # 通过 trace_logger 参数注入到 ReActAgent
    agent = ReActAgent(
        name="production-debugger",
        llm=llm,
        tool_registry=registry,
        system_prompt=(
            "你是生产问题排查专家。收到告警后，"
            "系统性地收集慢 SQL、线程状态等信息，给出根因分析和处置建议。"
        ),
        max_steps=6
    )
    # 注入 TraceLogger（ReActAgent 在执行过程中会调用 logger.log_event）
    agent.trace_logger = trace_logger

    return agent


if __name__ == "__main__":
    agent = create_production_debug_agent()
    result = agent.run("order-service P99 延迟突增到 3000ms，请排查根因")
    print(result)
    print(f"\n追踪文件已生成，可用浏览器打开 HTML 文件查看完整链路")
    # 生成的 HTML 文件包含：每步推理、工具调用参数、工具返回值、token 统计
    # 等价于 SkyWalking 的 Trace 详情页
```

::: details ☕ Java 对比：`TraceLogger` vs `SkyWalking / Micrometer`

```python
# Python：TraceLogger 手动埋点
logger.log_event("tool_call", {"tool_name": "query_db", "args": {...}}, step=1)
logger.log_event("tool_result", {"tool_name": "query_db", "result": "..."}, step=1)
```

```java
// Java：SkyWalking 自动探针（AOP 方式，零侵入）
@Trace(operationName = "queryDatabase")
public List<Order> queryOrders(String status) {
    // SkyWalking 探针自动记录：入参、出参、耗时、TraceId
    return orderRepository.findByStatus(status);
}

// 或者 Micrometer 手动埋点
Timer.Sample sample = Timer.start(registry);
List<Order> orders = queryOrders(status);
sample.stop(registry.timer("db.query", "table", "orders"));
```

核心差异：Java 可以用 AOP 实现自动埋点（零侵入），Python 的 `TraceLogger` 需要在 Agent 执行逻辑中手动调用 `log_event`。但两者的目标相同：在出问题时能还原完整的执行链路，快速定位根因。
:::

## ✅ 本章小结

**本章依赖**：
- 依赖第7章的 **工具调用机制**：`TraceLogger` 记录的 `tool_call` 和 `tool_result` 事件，正是第7章 `ToolRegistry.execute_tool` 流程的结构化日志
- 依赖第10章的 **熔断器**：熔断器触发的 `CIRCUIT_OPEN` 错误会以 `error` 事件形式出现在 JSONL 日志中，帮助排查哪个工具频繁失败

**后续应用**：
- 本章的 **`TraceLogger`** 在第13–15章所有企业实战章节中作为基础设施组件使用，确保每次 Agent 执行都留有可审计的链路记录
- 本章的 **JSONL 输出格式**可直接接入 ELK Stack（Elasticsearch + Logstash + Kibana），为生产级 Agent 监控平台提供数据来源
