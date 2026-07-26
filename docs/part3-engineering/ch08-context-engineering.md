---
title: 第8章 上下文工程
description: 理解 GSSC 流水线与 token 预算管理，构建生产级上下文管理方案
---

# 第8章 上下文工程

## 🗺️ 在知识体系中的位置

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0;font-family:sans-serif;font-size:13px">
  <a href="/part1-foundation/ch03-llm-basics" style="background:#f1f5f9;color:#64748b;padding:6px 14px;border-radius:8px;border:1.5px solid #e2e8f0;text-decoration:none">第3章 LLM 基础</a>
  <span style="color:#94a3b8;font-size:16px">→</span>
  <a href="/part3-engineering/ch07-tool-system" style="background:#f1f5f9;color:#64748b;padding:6px 14px;border-radius:8px;border:1.5px solid #e2e8f0;text-decoration:none">第7章 工具系统</a>
  <span style="color:#94a3b8;font-size:16px">→</span>
  <span style="background:#3b82f6;color:#fff;padding:6px 14px;border-radius:8px;font-weight:700;border:2px solid #1d4ed8">📍 第8章 上下文工程</span>
  <span style="color:#94a3b8;font-size:16px">→</span>
  <a href="/part3-engineering/ch09-session-persistence" style="background:#f1f5f9;color:#64748b;padding:6px 14px;border-radius:8px;border:1.5px solid #e2e8f0;text-decoration:none">第9章 会话持久化</a>
</div>

上下文工程是 Agent 工程化的核心挑战：如何在有限的 token 窗口内，把最有价值的信息塞进 Prompt。本章讲解 HelloAgents 的 GSSC 流水线和 `ContextBuilder`，第14章数据查询 Agent 直接应用本章技术。

## 🎯 本章你能学到什么

- 能用 GSSC 四步（Gather-Select-Structure-Compress）描述上下文构建流程
- 能解释 `ContextPacket` 的 `relevance_score` 和 `token_count` 字段在 Select 阶段的作用
- 能说明 `ContextConfig.max_tokens` 和 `reserve_ratio` 的关系，以及为什么要留出生成余量
- 能用 Java 视角理解 `ContextPacket` 与 `MDC`（Mapped Diagnostic Context）的类比关系

## 📖 核心概念

### 为什么需要上下文工程

**结论**：LLM 的上下文窗口是有限且昂贵的资源。当 Agent 运行多轮后，历史消息 + 工具结果 + 知识库内容可能超过窗口上限，上下文工程的任务是：在 token 预算内，最大化信息密度。

与 Java 后端的 HTTP 请求处理类比：上下文窗口就像 JVM 堆内存——无限制地堆入数据会导致 OOM（超出 token 限制）或性能下降（token 越多，推理越慢越贵）。`ContextBuilder` 相当于一个智能的"内存管理器"，自动决定哪些信息值得保留、哪些可以丢弃。

### GSSC 流水线

**结论**：`ContextBuilder.build()` 是一个四阶段流水线：Gather（收集候选）→ Select（筛选排序）→ Structure（结构化模板）→ Compress（预算压缩）。

```python
# 来源: hello_agents/context/builder.py — ContextBuilder.build 方法
def build(self, user_query: str, conversation_history=None,
          system_instructions=None, additional_packets=None) -> str:

    # 1. Gather：从多源收集候选信息包（历史、工具结果、系统指令）
    packets = self._gather(user_query, conversation_history or [],
                           system_instructions, additional_packets or [])

    # 2. Select：基于相关性+新近性评分，按 token 预算筛选
    selected_packets = self._select(packets, user_query)

    # 3. Structure：将选中的包组装成分区结构的 Prompt
    structured_context = self._structure(selected_packets, user_query, system_instructions)

    # 4. Compress：如果结构化结果仍超预算，执行截断压缩
    final_context = self._compress(structured_context)

    return final_context
```

### `ContextPacket`：信息包数据模型

```python
# 来源: hello_agents/context/builder.py — ContextPacket
@dataclass
class ContextPacket:
    """上下文信息包：携带内容 + 元信息"""
    content: str                          # 实际内容
    timestamp: datetime                   # 创建时间（用于新近性评分）
    metadata: Dict[str, Any]              # 类型标签（type: "history"/"instructions" 等）
    token_count: int = 0                  # 自动计算的 token 数
    relevance_score: float = 0.0          # 与用户查询的相关性（0.0–1.0）

    def __post_init__(self):
        if self.token_count == 0:
            self.token_count = count_tokens(self.content)  # 自动统计 token
```

::: details ☕ Java 对比：`ContextPacket` vs `MDC`（Mapped Diagnostic Context）

Java 的 `MDC`（SLF4J/Logback 的线程上下文）也是"把附加信息打包随请求传递"的模式：

```python
# Python：ContextPacket 携带 relevance_score 元信息
packet = ContextPacket(
    content="用户上一轮说：查一下订单状态",
    metadata={"type": "history"},
    relevance_score=0.85
)
# Select 阶段用 relevance_score 决定是否保留此包
```

```java
// Java：MDC 携带 requestId 等元信息，随日志传播
MDC.put("requestId", "REQ-001");
MDC.put("userId", "u-123");
// 日志系统用 MDC 中的 key 决定日志路由和过滤
logger.info("查询订单状态");
MDC.clear();
```

两者都是"信息包 + 元数据"模式。差别在于：`ContextPacket` 的元数据影响**信息是否被 LLM 看到**，MDC 的元数据影响**日志如何被处理**。
:::

### Select 阶段：评分与预算控制

```python
# 来源: hello_agents/context/builder.py — _select 方法（核心逻辑）
def _select(self, packets, user_query) -> List[ContextPacket]:
    query_tokens = set(user_query.lower().split())

    for packet in packets:
        # 相关性评分：关键词重叠率
        content_tokens = set(packet.content.lower().split())
        overlap = len(query_tokens & content_tokens)
        packet.relevance_score = overlap / len(query_tokens) if query_tokens else 0.0

    # 复合评分：70% 相关性 + 30% 新近性（时间衰减）
    # 按预算填充：先放系统指令（强约束，不参与竞争），再按评分填充其余
    available_tokens = self.config.get_available_tokens()  # max_tokens * (1 - reserve_ratio)
    selected = []
    used_tokens = 0

    for packet in sorted_by_score:
        if used_tokens + packet.token_count > available_tokens:
            continue  # 超出预算，跳过（不截断，保留完整包）
        selected.append(packet)
        used_tokens += packet.token_count

    return selected
```

### `ContextConfig`：token 预算配置

```python
# 来源: hello_agents/context/builder.py — ContextConfig
@dataclass
class ContextConfig:
    max_tokens: int = 8000        # 总 token 预算
    reserve_ratio: float = 0.15  # 保留 15% 给 LLM 生成（不用于输入）
    min_relevance: float = 0.3   # 相关性低于此阈值的包被过滤

    def get_available_tokens(self) -> int:
        return int(self.max_tokens * (1 - self.reserve_ratio))
        # 8000 * 0.85 = 6800 tokens 用于输入，1200 tokens 留给生成
```

::: tip ⚙️ 工程技巧：`reserve_ratio` ≈ 数据库连接池的最大连接数留白

连接池不会把所有连接都分配出去，总要预留几个给紧急操作。`reserve_ratio` 同理：不能把 token 窗口塞满，必须留出"出口空间"给 LLM 生成回答。如果 Prompt 占用了 100% 的上下文窗口，LLM 将无法生成任何输出。生产建议：reserve_ratio 设 15–20%。
:::

### `TokenCounter`：精确 Token 统计

```python
# 来源: hello_agents/context/token_counter.py — TokenCounter
class TokenCounter:
    def __init__(self, model: str = "gpt-4"):
        self._encoding = self._get_encoding()  # tiktoken 编码器
        self._cache: Dict[str, int] = {}        # 消息内容 → token 数缓存

    def count_message(self, message: Message) -> int:
        """计算单条消息 token 数（带缓存，避免重复计算）"""
        cache_key = f"{message.role}:{message.content}"
        if cache_key in self._cache:
            return self._cache[cache_key]
        tokens = self._count_text(message.content) + 4  # +4 是 role 标记的开销
        self._cache[cache_key] = tokens
        return tokens

    def _count_text(self, text: str) -> int:
        if self._encoding:
            return len(self._encoding.encode(text))  # tiktoken 精确计算
        return len(text) // 4  # 降级：字符数 / 4 粗略估算（1 token ≈ 4 英文字符）
```

## 💻 代码实战

```python
# 来源: hello_agents/context/builder.py (ContextBuilder, ContextConfig, ContextPacket)
# 来源: hello_agents/context/token_counter.py (TokenCounter)
from hello_agents.context.builder import ContextBuilder, ContextConfig, ContextPacket
from hello_agents.context.token_counter import TokenCounter
from hello_agents.core.message import Message
from datetime import datetime

# 初始化：配置 token 预算
config = ContextConfig(
    max_tokens=8000,     # 总预算（对应所用模型的上下文窗口）
    reserve_ratio=0.15,  # 留出 15% 给生成
    min_relevance=0.2    # 相关性低于 0.2 的历史消息被过滤
)
builder = ContextBuilder(config=config)

# 构建上下文：传入查询、历史、系统指令
history = [
    Message("查一下昨天的销售额", role="user"),
    Message("昨天销售额为 128 万元，同比增长 12%", role="assistant"),
]

context = builder.build(
    user_query="本月累计销售额是多少？",
    conversation_history=history,
    system_instructions="你是一个数据分析助手，基于销售数据回答问题，回答要精确。",
)
print(context)

# 单独使用 TokenCounter 统计成本
counter = TokenCounter(model="gpt-4")
total_tokens = counter.count_messages(history)
print(f"历史消息占用 token: {total_tokens}")
print(f"缓存大小: {counter.get_cache_size()}")
```

## 🏢 企业场景落地

Java 后端中，"上下文感知的 SQL 生成"是 LLM 落地的高频场景：用户用自然语言提问，Agent 需要结合数据库 Schema、用户历史查询记录、当前业务上下文，才能生成精准的 SQL。`ContextBuilder` 正是解决这个问题的工程方案。

```python
# 来源依赖: hello_agents/context/builder.py (ContextBuilder, ContextConfig, ContextPacket)
# 来源依赖: hello_agents/core/llm.py (HelloAgentsLLM)
# 企业场景：上下文感知的 SQL 生成 Agent
from hello_agents.context.builder import ContextBuilder, ContextConfig, ContextPacket
from hello_agents.core.llm import HelloAgentsLLM
from hello_agents.core.message import Message
from datetime import datetime
import asyncio


class SqlGenerationAgent:
    """
    上下文感知的 SQL 生成 Agent。
    在 Java 后端系统中，等价于一个增强版的 MyBatis/JPA 查询生成器，
    能理解自然语言、感知数据库 Schema 和历史查询上下文。
    """

    def __init__(self):
        self.llm = HelloAgentsLLM()
        self.context_builder = ContextBuilder(config=ContextConfig(
            max_tokens=6000,
            reserve_ratio=0.2,  # 留出更多空间给 SQL 生成
        ))
        self.history = []

    async def generate_sql(self, natural_language_query: str, db_schema: str) -> str:
        """根据自然语言查询和 Schema 生成 SQL"""

        # 将 Schema 作为高优先级的附加信息包
        schema_packet = ContextPacket(
            content=f"数据库 Schema：\n{db_schema}",
            metadata={"type": "knowledge_base"},
            relevance_score=1.0,  # 强制最高相关性，确保 Schema 不被过滤
            timestamp=datetime.now()
        )

        # 构建包含 Schema + 历史 + 系统指令的完整上下文
        context = self.context_builder.build(
            user_query=natural_language_query,
            conversation_history=self.history,
            system_instructions=(
                "你是一个 MySQL 专家，根据用户需求生成高效的 SQL 查询。"
                "只输出 SQL 语句，不要任何解释。"
            ),
            additional_packets=[schema_packet]
        )

        # 调用 LLM 生成 SQL
        response = await self.llm.ainvoke([{"role": "user", "content": context}])
        sql = response.content.strip()

        # 更新历史（用于下一轮的上下文构建）
        self.history.append(Message(natural_language_query, role="user"))
        self.history.append(Message(sql, role="assistant"))

        return sql


if __name__ == "__main__":
    agent = SqlGenerationAgent()

    schema = """
    CREATE TABLE orders (
        id BIGINT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        status ENUM('pending', 'paid', 'shipped', 'completed', 'cancelled'),
        amount DECIMAL(10,2),
        created_at DATETIME,
        INDEX idx_user_status (user_id, status)
    );
    CREATE TABLE users (
        id BIGINT PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(200),
        vip_level INT DEFAULT 0
    );
    """

    async def demo():
        sql = await agent.generate_sql(
            "查询 VIP 等级大于 2 的用户，最近 7 天内有未完成支付的订单，按订单金额降序取前 10 条",
            schema
        )
        print("生成的 SQL:")
        print(sql)

    asyncio.run(demo())
```

## ✅ 本章小结

**本章依赖**：
- 依赖第3章的 **LLM 消息协议**：`ContextBuilder` 的最终输出是注入到 `invoke` 的 Prompt 消息列表
- 依赖第7章的 **工具系统**：工具执行结果以 `ContextPacket`（`type: "tool_result"`）的形式进入 GSSC 流水线

**后续应用**：
- 本章的 **`ContextPacket` 信息包机制**在第9章会话持久化中得到延伸：`SessionStore` 将完整的对话历史持久化，下次恢复时再通过 `ContextBuilder` 重建上下文
- 本章的 **token 预算管理**在第14章数据查询 Agent 中直接应用，通过 `ContextConfig` 动态控制 SQL 生成 Prompt 的信息密度
