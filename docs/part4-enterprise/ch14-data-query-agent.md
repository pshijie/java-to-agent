---
title: 第14章 数据查询 Agent 实战
description: 综合运用 PlanSolve + ContextBuilder + SessionStore，构建自然语言转 SQL 的数据查询 Agent
---

# 第14章 数据查询 Agent 实战

## 🗺️ 在知识体系中的位置

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0;font-family:sans-serif;font-size:13px">
<a href="/part2-paradigms/ch05-plan-solve" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第5章 Plan-Solve</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part3-engineering/ch08-context-engineering" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第8章 上下文工程</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part3-engineering/ch09-session-persistence" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第9章 会话持久化</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<span style="background:#3b82f6;color:#fff;padding:6px 14px;border-radius:8px;font-weight:700;border:2px solid #1d4ed8">第14章 数据查询实战</span>
</div>

本章综合运用 Plan-Solve 范式、ContextBuilder 上下文管理和 SessionStore 会话持久化，构建一个支持多轮对话修正的自然语言转 SQL Agent——这是 Java 后端系统中 LLM 落地最高频的场景之一。

## 🎯 本章你能学到什么

- 能说明为什么数据查询场景用 Plan-Solve 比 ReAct 更合适
- 能解释 ContextBuilder 如何把 Schema 信息以高优先级注入 Prompt
- 能实现多轮 SQL 修正对话（用户纠错 → Agent 修改 → 再次执行）
- 能用 SessionStore 实现跨请求的查询会话恢复

## 📖 核心概念

### 为什么选 Plan-Solve

自然语言转 SQL 是一个结构化的多步任务：
1. 解析用户意图（理解"最近 7 天"、"VIP 用户"等语义）
2. 确定涉及的数据表和字段
3. 构造 WHERE/JOIN/GROUP BY 子句
4. 添加索引提示和 LIMIT 优化
5. 生成最终 SQL 并验证

这五步有明确的顺序依赖，非常适合 Plan-Solve 的"先规划全局再逐步执行"模式。ReAct 的逐步推理在这里会产生不必要的中间轮次，而 Plan-Solve 在第一步就生成完整计划，每步执行时上下文更集中。

### ContextBuilder 的 Schema 注入策略

::: tip 💡 快速理解 ContextBuilder（详见[第8章 上下文工程](/part3-engineering/ch08-context-engineering)）

LLM 的"记忆力"有上限（token 窗口），当对话轮次增多后，早期的信息会被挤掉。`ContextBuilder` 是一个**智能信息筛选器**：它从所有可用信息（对话历史、工具结果、知识库文档）中，挑选出**与当前问题最相关的部分**塞进 Prompt，保证 LLM 每次都能看到最有价值的上下文。

类比 Java：相当于 Hibernate 的懒加载 + 分页查询——不是把数据库全部 load 进内存，而是按需加载最相关的部分。

核心概念：
- `ContextPacket`：一个信息包，包含内容本身 + 相关性评分 + token 消耗量
- **`relevance_score`**：0.0–1.0，表示这段信息对当前问题的相关程度，评分越高越优先保留
- `builder.build()`：执行 4 步流水线（收集 → 评分筛选 → 结构化 → 压缩），最终输出一段经过精选的 Prompt 文本
:::

在数据查询场景中，数据库 Schema（表结构）对 SQL 生成**至关重要**——没有 Schema，LLM 不知道有哪些表、哪些字段可用。因此我们将 Schema 以 `relevance_score=1.0`（最高分）注入，确保它永远不会被筛选器丢弃，不管对话历史多长。

```python
# 来源: hello_agents/context/builder.py (ContextBuilder, ContextPacket)
# 将 Schema 包装为 ContextPacket，设最高相关性
schema_packet = ContextPacket(
    content=f"数据库 Schema：\n{db_schema}",  # 完整的建表语句
    metadata={"type": "knowledge_base"},       # 标记为"知识库"类型
    relevance_score=1.0,  # 1.0 = 最高优先级，绝不被过滤（对比：普通历史消息约 0.3–0.7）
)

# builder.build() 会自动完成以下工作：
# 1. Gather: 收集 schema_packet + 对话历史 + 系统指令
# 2. Select: 按 relevance_score 从高到低排序，在 token 预算内尽量多保留
# 3. Structure: 按 [系统指令] [任务] [证据] [历史] 的模板组织
# 4. Compress: 如果还超出预算，截断低分部分
context = builder.build(
    user_query=query,                         # 用户的自然语言查询
    conversation_history=history,             # 之前的对话记录（自动计算相关性）
    system_instructions=system_prompt,        # "你是 MySQL 专家"等角色指令
    additional_packets=[schema_packet]        # Schema 作为额外高优先级包注入
)
# context 是最终的 Prompt 字符串，直接传给 LLM
```

## 💻 代码实战

```python
# 来源: hello_agents/agents/plan_solve_agent.py (PlanSolveAgent)
# 来源: hello_agents/context/builder.py (ContextBuilder, ContextConfig, ContextPacket)
# 来源: hello_agents/core/session_store.py (SessionStore)
# 来源: hello_agents/observability/trace_logger.py (TraceLogger)
# 来源: hello_agents/core/llm.py (HelloAgentsLLM)
import asyncio
from hello_agents.agents.plan_solve_agent import PlanSolveAgent
from hello_agents.context.builder import ContextBuilder, ContextConfig, ContextPacket
from hello_agents.core.session_store import SessionStore
from hello_agents.observability.trace_logger import TraceLogger
from hello_agents.core.llm import HelloAgentsLLM
from hello_agents.core.message import Message
from datetime import datetime


# 模拟数据库 Schema（实际生产中从数据库 information_schema 动态获取）
DB_SCHEMA = """
CREATE TABLE orders (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    status ENUM('pending','paid','shipped','completed','cancelled') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME,
    INDEX idx_user_status (user_id, status),
    INDEX idx_created (created_at)
);
CREATE TABLE users (
    id BIGINT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(200) UNIQUE,
    vip_level INT DEFAULT 0,
    created_at DATETIME NOT NULL
);
CREATE TABLE order_items (
    id BIGINT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    INDEX idx_order (order_id)
);
"""


class DataQueryAgent:
    """
    多轮自然语言转 SQL Agent。
    - Plan-Solve：分步生成精确 SQL
    - ContextBuilder：Schema + 对话历史注入
    - SessionStore：跨请求会话持久化
    - TraceLogger：查询链路追踪
    """

    def __init__(self, session_name: str = None):
        self.llm = HelloAgentsLLM()
        self.session_name = session_name
        self.history: list = []

        # ContextBuilder：为 SQL 生成保留更多 token 给输出
        self.context_builder = ContextBuilder(config=ContextConfig(
            max_tokens=6000,
            reserve_ratio=0.25,  # 留 25% 给 SQL 生成
            min_relevance=0.1    # 降低相关性阈值，保留更多历史
        ))

        # SessionStore：持久化多轮查询历史
        self.session_store = SessionStore(session_dir="memory/sessions")

        # TraceLogger：记录每次查询的完整链路
        self.trace_logger = TraceLogger(output_dir="memory/traces")

        # Plan-Solve Agent：专注 SQL 生成任务
        self.agent = PlanSolveAgent(
            name="sql-generator",
            llm=self.llm,
            planner_prompt="""你是 SQL 查询规划专家。将用户的自然语言需求分解为以下步骤：
1. 语义解析：理解用户意图（时间范围、过滤条件、排序等）
2. 表关系分析：确定需要 JOIN 哪些表
3. 条件构建：转换自然语言条件为 SQL WHERE 子句
4. 聚合/排序：确定 GROUP BY、ORDER BY、LIMIT
5. 性能优化：添加 USE INDEX 提示，避免全表扫描""",
            executor_prompt="""你是 MySQL 专家。执行当前 SQL 构建步骤。
只输出 SQL 片段或最终完整 SQL，格式整洁，关键字大写。
最终 SQL 必须：1) 参数化（使用 ? 占位）2) 有合理 LIMIT 3) WHERE 条件走索引。""",
        )

        # 恢复已有会话
        if session_name:
            self._restore_session(session_name)

    def _restore_session(self, session_name: str):
        """恢复历史会话"""
        import os
        session_file = f"memory/sessions/{session_name}.json"
        if os.path.exists(session_file):
            try:
                data = self.session_store.load(session_file)
                self.history = [
                    Message(m["content"], role=m["role"])
                    for m in data.get("history", [])
                ]
                print(f"✅ 会话已恢复，历史查询 {len(self.history)//2} 轮")
            except Exception as e:
                print(f"⚠️ 会话恢复失败: {e}")

    def query(self, natural_language: str) -> str:
        """处理一次自然语言查询，返回 SQL"""
        self.trace_logger.log_event(
            "session_start",
            {"query": natural_language, "agent": "sql-generator"}
        )

        # 构建包含 Schema 的上下文
        schema_packet = ContextPacket(
            content=f"数据库 Schema（使用 MySQL 8.0）：\n{DB_SCHEMA}",
            metadata={"type": "knowledge_base"},
            relevance_score=1.0,
            timestamp=datetime.now()
        )

        context = self.context_builder.build(
            user_query=natural_language,
            conversation_history=self.history[-6:],  # 保留最近 3 轮
            system_instructions="基于给定 Schema 生成精确的 MySQL 查询 SQL",
            additional_packets=[schema_packet]
        )

        # Plan-Solve 生成 SQL
        sql = self.agent.run(context)

        # 更新历史
        self.history.append(Message(natural_language, role="user"))
        self.history.append(Message(sql, role="assistant"))

        # 持久化会话
        self.session_store.save(
            agent_config={"name": "sql-generator", "llm_model": "auto"},
            history=self.history,
            tool_schema_hash="no-tools",
            read_cache={},
            metadata={"query_count": len(self.history) // 2},
            session_name=self.session_name
        )

        self.trace_logger.log_event(
            "session_end",
            {"sql": sql, "status": "success"}
        )

        return sql

    def close(self):
        """关闭 TraceLogger，生成最终报告"""
        self.trace_logger.finalize()
```

## 🏢 企业场景落地

下面演示完整的多轮 SQL 修正对话——这是真实生产场景中最常见的使用模式：用户先提一个初步需求，收到 SQL 后发现不完整，再追加补充条件。

```python
# 完整可运行示例
import asyncio
from hello_agents.agents.plan_solve_agent import PlanSolveAgent
from hello_agents.context.builder import ContextBuilder, ContextConfig, ContextPacket
from hello_agents.core.session_store import SessionStore
from hello_agents.observability.trace_logger import TraceLogger
from hello_agents.core.llm import HelloAgentsLLM
from hello_agents.core.message import Message
# （复用上方定义的 DB_SCHEMA 和 DataQueryAgent 类）

if __name__ == "__main__":
    # 创建 Agent，绑定会话（支持跨请求恢复）
    agent = DataQueryAgent(session_name="data-analyst-session-001")

    print("=== 第 1 轮：初步查询 ===")
    sql1 = agent.query(
        "查询最近 7 天内下单但未完成支付的用户，按订单金额降序，取前 20 条，需要用户姓名和邮箱"
    )
    print("生成的 SQL:")
    print(sql1)

    print("\n=== 第 2 轮：追加条件（多轮修正）===")
    sql2 = agent.query(
        "在上面的查询基础上，只查询 VIP 等级大于 2 的用户，"
        "并且订单金额必须超过 500 元"
    )
    print("修正后的 SQL:")
    print(sql2)

    print("\n=== 第 3 轮：性能优化 ===")
    sql3 = agent.query(
        "这个查询在大数据量下可能很慢，请加上 USE INDEX 提示并分析哪些字段需要建索引"
    )
    print("优化后的 SQL + 索引建议:")
    print(sql3)

    agent.close()
    print("\n✅ 查询追踪报告已生成")
```

::: details ☕ Java 对比：多轮会话状态 vs `HttpSession + Spring MVC`

```python
# Python：SessionStore 持久化多轮查询历史
agent.session_store.save(history=agent.history, session_name="user-123")
# 下次请求时恢复
agent._restore_session("user-123")  # 从文件恢复 history
```

```java
// Java：Spring MVC HttpSession 跨请求保持状态
@PostMapping("/query")
public String query(HttpSession session, String naturalLanguage) {
    // Spring Session 自动持久化到 Redis
    List<Message> history = (List<Message>) session.getAttribute("history");
    if (history == null) history = new ArrayList<>();

    String sql = sqlAgent.generateSql(naturalLanguage, history);

    history.add(new Message(naturalLanguage, "user"));
    history.add(new Message(sql, "assistant"));
    session.setAttribute("history", history);

    return sql;
}
```

设计上完全等价：Java 用 `HttpSession` + Spring Session（Redis 持久化）；Python 用 `SessionStore`（本地 JSON 文件）。生产级 Agent 平台替换存储层即可，接口语义不变。
:::

## ✅ 本章小结

**本章依赖**：
- 依赖第5章的 **Plan-Solve 范式**：分步生成 SQL 的五步计划直接映射到 `Planner.plan()` 的输出
- 依赖第8章的 ContextBuilder：Schema 以 `relevance_score=1.0` 的 `ContextPacket` 强制注入，确保 LLM 始终看到完整的表结构
- 依赖第9章的 SessionStore：每轮查询后自动持久化，支持跨请求的多轮修正对话
- 依赖第12章的 **TraceLogger**：记录每次 SQL 生成的完整 Plan-Solve 链路，方便排查生成质量问题

**后续应用**：
- 本章的**多组件集成模式**（Plan-Solve + Context + Session + Trace）在第15章多 Agent 系统中被进一步扩展，加入了 TaskTool 子代理和 CircuitBreaker 熔断保护
