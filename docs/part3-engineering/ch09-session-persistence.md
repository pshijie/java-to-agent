---
title: 第9章 会话持久化
description: 掌握 SessionStore 原子写入与会话管理，实现多轮对话状态持久化
---

# 第9章 会话持久化

## 🗺️ 在知识体系中的位置

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0;font-family:sans-serif;font-size:13px">
  <a href="/part3-engineering/ch08-context-engineering" style="background:#f1f5f9;color:#64748b;padding:6px 14px;border-radius:8px;border:1.5px solid #e2e8f0;text-decoration:none">第8章 上下文工程</a>
  <span style="color:#94a3b8;font-size:16px">→</span>
  <span style="background:#3b82f6;color:#fff;padding:6px 14px;border-radius:8px;font-weight:700;border:2px solid #1d4ed8">📍 第9章 会话持久化</span>
  <span style="color:#94a3b8;font-size:16px">→</span>
  <a href="/part3-engineering/ch11-sub-agent" style="background:#f1f5f9;color:#64748b;padding:6px 14px;border-radius:8px;border:1.5px solid #e2e8f0;text-decoration:none">第11章 子代理</a>
  <span style="color:#94a3b8;font-size:16px">→</span>
  <a href="/part4-enterprise/ch14-data-query-agent" style="background:#f1f5f9;color:#64748b;padding:6px 14px;border-radius:8px;border:1.5px solid #e2e8f0;text-decoration:none">第14章 数据查询实战</a>
</div>

本章将第8章的"运行时上下文管理"延伸到"跨轮次的持久化"。`SessionStore` 解决的问题是：Agent 崩溃或用户重启后，如何从上次中断的地方继续，而不是从头开始。

## 🎯 本章你能学到什么

- 能说明为什么用"临时文件 + 原子重命名"而非直接写入来保证数据完整性
- 能解释 `tool_schema_hash` 字段的作用，以及为什么工具集变化会影响会话恢复的可靠性
- 能说明 `check_config_consistency` 方法在恢复会话时的工程价值
- 能用 Java 视角理解 `SessionStore` 与 `Redis + Spring Session` 的对应关系

## 📖 核心概念

### 为什么需要会话持久化

**结论**：Agent 处理长任务时（如：分析大型代码库、多步数据处理），任务可能运行数分钟甚至更长。如果中途崩溃，没有持久化就意味着从零重来，浪费大量 API 调用成本。`SessionStore` 将"对话快照"写入磁盘，支持断点续传。

在 Java 后端系统中，这个问题早就有成熟解决方案：HTTP Session 存入 Redis（Spring Session），任何服务实例都能恢复用户状态。`SessionStore` 是单机场景下的等价实现，用本地 JSON 文件替代 Redis。

### 原子写入：临时文件 + `os.replace`

```python
# 来源: hello_agents/core/session_store.py — SessionStore.save 方法核心
def save(self, agent_config, history, tool_schema_hash, read_cache, metadata, session_name=None) -> str:
    """保存会话（原子写入，防止数据损坏）"""
    session_id = self._generate_session_id()  # 格式: s-20240115-143052-a3f2

    filepath = self.session_dir / f"session-{session_id}.json"

    session_data = {
        "session_id": session_id,
        "saved_at": datetime.now().isoformat(),
        "agent_config": agent_config,           # Agent 配置（模型、max_steps 等）
        "history": [msg.to_dict() for msg in history],  # 完整对话历史
        "tool_schema_hash": tool_schema_hash,    # 工具集的哈希（用于一致性检查）
        "read_cache": read_cache,               # 文件元数据缓存（乐观锁用）
        "metadata": metadata                    # token 数、步骤数、耗时等统计
    }

    # 原子写入：先写临时文件，再重命名
    temp_path = str(filepath) + ".tmp"
    with open(temp_path, 'w', encoding='utf-8') as f:
        json.dump(session_data, f, indent=2, ensure_ascii=False)

    os.replace(temp_path, filepath)  # 原子重命名：要么成功，要么旧文件不变
    return str(filepath)
```

::: tip ⚙️ 工程技巧：`os.replace` = 数据库事务的原子性

直接用 `open(filepath, 'w')` 写入存在风险：如果写入中途崩溃，文件内容可能是残缺的 JSON，下次读取会解析失败。

`temp → os.replace` 的技巧等价于数据库事务：写入新内容到临时文件（PREPARE），`os.replace` 是一个**原子系统调用**（在同一文件系统内），相当于 COMMIT。如果 PREPARE 阶段崩溃，原文件完好无损，等价于 ROLLBACK。这是 `fsync` + 原子重命名的经典工程模式，Kafka、SQLite 等都使用类似技术。
:::

### 会话 ID 生成

```python
# 来源: hello_agents/core/session_store.py — _generate_session_id
def _generate_session_id(self) -> str:
    """生成格式: s-{timestamp}-{uuid[:8]}，兼顾可读性和唯一性"""
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    unique_suffix = uuid.uuid4().hex[:8]
    return f"s-{timestamp}-{unique_suffix}"
    # 示例: s-20240115-143052-a3f2b4c8
```

### 会话恢复与一致性检查

```python
# 来源: hello_agents/core/session_store.py — check_config_consistency + check_tool_schema_consistency
def check_config_consistency(self, saved_config, current_config) -> Dict:
    """检查恢复时的环境变化，输出 warnings"""
    warnings = []
    if saved_config.get("llm_model") != current_config.get("llm_model"):
        warnings.append(f"模型变化: {saved_config['llm_model']} → {current_config['llm_model']}")
    if saved_config.get("max_steps") != current_config.get("max_steps"):
        warnings.append(f"最大步数变化: {saved_config['max_steps']} → {current_config['max_steps']}")
    return {"consistent": len(warnings) == 0, "warnings": warnings}

def check_tool_schema_consistency(self, saved_hash: str, current_hash: str) -> Dict:
    """检查工具集是否变化（哈希比对）"""
    changed = saved_hash != current_hash
    return {
        "changed": changed,
        "recommendation": "建议重新读取文件" if changed else "可以安全恢复"
        # 工具集变化意味着 LLM 之前的工具调用推理可能不再适用
    }
```

::: details ☕ Java 对比：`SessionStore` vs `Redis + Spring Session`

```python
# Python：SessionStore 本地 JSON 文件
store = SessionStore(session_dir="memory/sessions")
filepath = store.save(agent_config=cfg, history=msgs, ...)  # 保存
session_data = store.load(filepath)                          # 恢复
```

```java
// Java：Spring Session + Redis 分布式会话
// application.properties: spring.session.store-type=redis

@RestController
public class ChatController {
    @PostMapping("/chat")
    public String chat(HttpSession session, String userMessage) {
        // Spring Session 自动将 HttpSession 存入 Redis
        List<String> history = (List<String>) session.getAttribute("history");
        if (history == null) history = new ArrayList<>();
        history.add(userMessage);
        session.setAttribute("history", history);
        return "OK";
    }
}
```

核心差异：Spring Session 是**分布式**（多实例共享 Redis），SessionStore 是**单机本地文件**。生产级 Agent 平台应替换为 Redis/数据库存储，接口设计可直接复用 `SessionStore` 的方法签名。
:::

### 会话列表管理

```python
# 来源: hello_agents/core/session_store.py — list_sessions
def list_sessions(self) -> List[Dict]:
    """列出所有会话，按保存时间倒序（最新的在最前）"""
    sessions = []
    for filepath in self.session_dir.glob("*.json"):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            sessions.append({
                "filename": filepath.name,
                "session_id": data.get("session_id"),
                "saved_at": data.get("saved_at"),
                "metadata": data.get("metadata", {})  # 包含 total_tokens、total_steps 等
            })
        except Exception as e:
            print(f"⚠️ 无法读取 {filepath}: {e}")  # 容错：跳过损坏文件

    sessions.sort(key=lambda x: x.get("saved_at", ""), reverse=True)
    return sessions
```

## 💻 代码实战

```python
# 来源: hello_agents/core/session_store.py (SessionStore)
from hello_agents.core.session_store import SessionStore
from hello_agents.core.message import Message

store = SessionStore(session_dir="memory/sessions")

# 模拟一次 Agent 会话后保存
history = [
    Message("帮我分析订单量下降的原因", role="user"),
    Message("根据数据分析，主要原因是：1) 促销活动结束 2) 节假日效应", role="assistant"),
]

filepath = store.save(
    agent_config={"name": "data-analyst", "llm_model": "gpt-4o", "max_steps": 10},
    history=history,
    tool_schema_hash="abc123def456",  # 工具集的 MD5 哈希
    read_cache={},
    metadata={"total_tokens": 1500, "total_steps": 3}
)
print(f"会话已保存: {filepath}")

# 恢复会话
session_data = store.load(filepath)
current_config = {"name": "data-analyst", "llm_model": "gpt-4o", "max_steps": 10}

# 一致性检查
result = store.check_config_consistency(session_data["agent_config"], current_config)
if result["warnings"]:
    print(f"⚠️ 警告: {result['warnings']}")
else:
    print("✅ 配置一致，可以安全恢复会话")

# 查看历史会话列表
sessions = store.list_sessions()
for s in sessions[:3]:
    print(f"{s['session_id']} - {s['saved_at']} - tokens: {s['metadata'].get('total_tokens', 0)}")
```

## 🏢 企业场景落地

Java 后端的多轮对话场景（如智能客服、多步骤表单填写）中，用户可能在任意步骤中断。`SessionStore` 让 Agent 能像 HTTP Session 一样，跨请求保持状态并支持断点续传。

```python
# 来源依赖: hello_agents/core/session_store.py (SessionStore)
# 来源依赖: hello_agents/agents/react_agent.py (ReActAgent)
# 来源依赖: hello_agents/core/llm.py (HelloAgentsLLM)
# 企业场景：多轮对话状态恢复 Agent
import json
from pathlib import Path
from hello_agents.core.session_store import SessionStore
from hello_agents.agents.react_agent import ReActAgent
from hello_agents.core.llm import HelloAgentsLLM
from hello_agents.core.message import Message


class PersistentChatAgent:
    """
    支持跨请求持久化的对话 Agent。
    等价于 Java 中的有状态 @SessionScoped Bean，
    会话状态持久化到本地文件（生产环境替换为 Redis）。
    """

    def __init__(self, session_name: str = None):
        self.llm = HelloAgentsLLM()
        self.store = SessionStore(session_dir="memory/sessions")
        self.session_name = session_name
        self.history = []
        self.agent = ReActAgent(
            name="persistent-assistant",
            llm=self.llm,
            system_prompt="你是一个持久化对话助手，记住用户的历史问题，提供连贯的回答。"
        )

        # 尝试恢复已有会话
        if session_name:
            self._try_restore_session(session_name)

    def _try_restore_session(self, session_name: str):
        """尝试从磁盘恢复会话"""
        session_files = list(Path("memory/sessions").glob(f"{session_name}.json"))
        if not session_files:
            print(f"ℹ️ 未找到会话 '{session_name}'，将创建新会话")
            return

        try:
            session_data = self.store.load(str(session_files[0]))
            # 恢复历史消息
            self.history = [
                Message(msg["content"], role=msg["role"])
                for msg in session_data.get("history", [])
            ]
            print(f"✅ 会话已恢复，历史消息 {len(self.history)} 条")
        except Exception as e:
            print(f"⚠️ 会话恢复失败: {e}，将创建新会话")

    def chat(self, user_message: str) -> str:
        """处理用户消息并持久化状态"""
        self.history.append(Message(user_message, role="user"))

        # 将历史注入 Agent（简化：直接用最近 5 轮历史）
        recent_history = self.history[-10:]
        history_text = "\n".join([f"[{m.role}] {m.content}" for m in recent_history[:-1]])
        query = f"历史对话:\n{history_text}\n\n当前问题: {user_message}" if history_text else user_message

        response = self.agent.run(query)
        self.history.append(Message(response, role="assistant"))

        # 每次对话后自动持久化（生产环境可改为异步写入）
        self.store.save(
            agent_config={"name": "persistent-assistant", "llm_model": "auto"},
            history=self.history,
            tool_schema_hash="no-tools",
            read_cache={},
            metadata={"message_count": len(self.history)},
            session_name=self.session_name
        )

        return response


if __name__ == "__main__":
    agent = PersistentChatAgent(session_name="user-123-support-session")
    print(agent.chat("我上周的订单 ORD-20240115-001 还没到货"))
    print(agent.chat("我刚才说的那个订单，能加急处理吗？"))  # 能正确理解"那个订单"
```

## ✅ 本章小结

**本章依赖**：
- 依赖第8章的 **`ContextBuilder`**：会话恢复后，完整的历史消息列表通过 `ContextBuilder.build()` 重建上下文，再注入 LLM

**后续应用**：
- 本章的 **`SessionStore` 原子写入**思想在第10章熔断器的失败计数设计中体现：`defaultdict` 的状态同样需要在 Agent 重启后恢复（通过 SessionStore 持久化熔断器状态）
- 本章的 **会话恢复 + 一致性检查机制**在第14章数据查询 Agent 中直接应用：多轮 SQL 修正对话依赖 SessionStore 保持查询上下文
