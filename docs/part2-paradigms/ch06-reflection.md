---
title: 第6章 Reflection 范式
description: 理解自评估循环与质量控制，构建能自我纠错的 Reflection Agent
---

# 第6章 Reflection 范式

## 🗺️ 在知识体系中的位置

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0;font-family:sans-serif;font-size:13px">
<a href="/part1-foundation/ch03-llm-basics" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第3章 LLM 基础</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<span style="background:#3b82f6;color:#fff;padding:6px 14px;border-radius:8px;font-weight:700;border:2px solid #1d4ed8">第6章 Reflection</span>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part4-enterprise/ch13-api-gateway-agent" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第13–15章 企业实战</a>
</div>

本章是三大范式的最后一章，介绍 Reflection 自评估循环。与 ReAct（边思考边行动）和 Plan-Solve（先规划再执行）不同，Reflection 在得到初步结果后，由模型自身评估质量并迭代优化。

## 🎯 本章你能学到什么

- 能描述 Reflection 的三阶段结构：初始执行 → 反思评估 → 迭代优化
- 能从 `reflection_agent.py` 源码中识别 `Memory` 模块的作用及其与会话历史的区别
- 能说明 `无需改进` 关键词作为终止条件的工程意图
- 能用 Java 视角理解 Reflection 与责任链（Chain of Responsibility）模式的对应关系
- 能独立构建一个数据查询质量检查 Agent

## 📖 核心概念

### Reflection 的核心思想

**结论**：Reflection 让 LLM 扮演两个角色——**生成者**（产出初始结果）和**评审者**（批判结果质量），通过"生成 → 反思 → 优化"的迭代循环提升输出质量，直到评审者认为"无需改进"为止。

这个模式在软件工程中并不陌生：Code Review、持续集成（CI）、单元测试都是"生成 → 验证 → 修复"的循环。Reflection Agent 将这个循环内化到 AI 系统本身。

**适用场景**：输出质量难以用规则验证，但 LLM 自身能感知质量差异的任务——代码生成、文档写作、SQL 优化、翻译质量检查。

### Memory 模块：追踪执行与反思轨迹

```python
# 来源: hello_agents/agents/reflection_agent.py — Memory 类
class Memory:
    """简单的短期记忆模块，存储 Agent 的行动与反思轨迹"""
    def __init__(self):
        self.records: List[Dict[str, Any]] = []  # 存储 execution 和 reflection 两类记录

    def add_record(self, record_type: str, content: str):
        """向记忆中添加记录，record_type 为 'execution' 或 'reflection'"""
        self.records.append({"type": record_type, "content": content})

    def get_trajectory(self) -> str:
        """将所有记忆格式化为连贯文本，用于构建 Prompt 上下文"""
        trajectory = ""
        for record in self.records:
            if record['type'] == 'execution':
                trajectory += f"--- 上一轮尝试 ---\n{record['content']}\n\n"
            elif record['type'] == 'reflection':
                trajectory += f"--- 评审员反馈 ---\n{record['content']}\n\n"
        return trajectory.strip()

    def get_last_execution(self) -> str:
        """获取最近一次的执行结果（最终答案的来源）"""
        for record in reversed(self.records):
            if record['type'] == 'execution':
                return record['content']
        return ""
```

::: tip ⚙️ 工程技巧：Memory vs 会话历史（session history）

`Memory` 模块只在**单次任务执行**期间存在，任务完成后重置（`self.memory = Memory()`）。它记录的是"这次任务经历了哪些迭代"，属于**工作内存（Working Memory）**。

第9章的 `SessionStore` 记录的是**跨轮次的对话历史**，任务之间持续存在。两者类比 Java 中的 `ThreadLocal`（请求级别，请求完成即销毁）vs Redis Session（跨请求持久化）。
:::

### 三阶段执行循环

```python
# 来源: hello_agents/agents/reflection_agent.py — ReflectionAgent.run 方法
def run(self, input_text: str, **kwargs) -> str:
    """Reflection Agent 主循环：初始执行 → 反思 → 优化"""
    self.memory = Memory()  # 每次任务重置工作记忆

    # 阶段 1：初始执行（生成第一版结果）
    initial_result = self._execute_task(input_text, **kwargs)
    self.memory.add_record("execution", initial_result)  # 记录到 Memory

    # 阶段 2：迭代循环（反思 + 优化）
    for i in range(self.max_iterations):  # 最多迭代 max_iterations 次，防止无限循环

        # 2a. 反思：LLM 扮演"评审者"角色，批判当前结果
        last_result = self.memory.get_last_execution()
        feedback = self._reflect_on_result(input_text, last_result, **kwargs)
        self.memory.add_record("reflection", feedback)

        # 2b. 检查终止条件："无需改进" 说明评审者满意，提前退出循环
        if "无需改进" in feedback or "no need for improvement" in feedback.lower():
            print("✅ 反思认为结果已无需改进，任务完成。")
            break  # 提前终止，不再浪费 LLM 调用

        # 2c. 优化：LLM 根据反馈改进结果
        refined_result = self._refine_result(input_text, last_result, feedback, **kwargs)
        self.memory.add_record("execution", refined_result)  # 记录新版本

    return self.memory.get_last_execution()  # 返回最后一次执行结果
```

### 反思 Prompt 设计

```python
# 来源: hello_agents/agents/reflection_agent.py — _reflect_on_result 方法
def _reflect_on_result(self, task: str, result: str, **kwargs) -> str:
    """对结果进行反思：LLM 切换为"批判性评审者"角色"""
    messages = [
        {"role": "system", "content": self.system_prompt},
        {"role": "user", "content": f"""请仔细审查以下回答，找出可能的问题或改进空间：

# 原始任务: {task}
# 当前回答: {result}

请分析这个回答的质量，指出不足之处，并提出具体的改进建议。
如果回答已经很好，请回答"无需改进"。"""}
    ]
    return self._get_llm_response(messages, **kwargs)
    # 关键：同一个 LLM，通过不同的 Prompt 切换"生成者"和"评审者"角色
```

::: details ☕ Java 对比：Reflection 循环 vs 责任链模式（Chain of Responsibility）

Reflection 的"生成 → 评审 → 优化"循环在结构上与 Java 责任链模式高度类似：

```python
# Python：Reflection 迭代优化
result = agent.execute_task(input)     # 第一个处理者：生成初版
feedback = agent.reflect(result)       # 第二个处理者：评审
if "无需改进" not in feedback:
    result = agent.refine(feedback)    # 第三个处理者：优化
```

```java
// Java：责任链模式等价结构
Handler generator = new GeneratorHandler();   // 生成初版
Handler reviewer  = new ReviewerHandler();    // 评审质量
Handler refiner   = new RefinerHandler();     // 根据反馈优化

generator.setNext(reviewer).setNext(refiner);
String result = generator.handle(inputTask);  // 链式处理
```

核心差异：Java 责任链的处理者在代码中静态定义；Reflection 的"评审者"和"生成者"是同一个 LLM 通过不同 Prompt 动态切换的，更灵活但也更难以单元测试。
:::

## 💻 代码实战

```python
# 来源: hello_agents/agents/reflection_agent.py (ReflectionAgent, Memory)
from hello_agents.agents.reflection_agent import ReflectionAgent
from hello_agents.core.llm import HelloAgentsLLM

llm = HelloAgentsLLM()

# 初始化：max_iterations 控制最大迭代次数
agent = ReflectionAgent(
    name="sql-optimizer",
    llm=llm,
    system_prompt="""你是一个 SQL 优化专家。
生成初版 SQL 后，反思时重点检查：1）是否有性能问题；2）是否覆盖边界条件；3）是否需要添加索引提示。
如果 SQL 已经最优，请回答"无需改进"。""",
    max_iterations=2,  # 最多优化 2 轮，平衡质量和 API 成本
)

# 运行：自动完成 生成 → 反思 → 优化 循环
result = agent.run("生成一个查询最近 24 小时内下单但未支付的用户列表的 SQL，表名 orders，字段 user_id, status, created_at")
print(result)
```

## 🏢 企业场景落地

在 Java 后端开发中，自动生成 SQL 查询是 LLM 的高频使用场景，但生成质量参差不齐。Reflection Agent 可以在生成 SQL 后自动做质量检查，减少"看起来对但实际有性能坑"的问题出现频率。

```python
# 来源依赖: hello_agents/agents/reflection_agent.py (ReflectionAgent)
# 企业场景：数据查询 SQL 质量自检 Agent
from hello_agents.agents.reflection_agent import ReflectionAgent
from hello_agents.core.llm import HelloAgentsLLM


def create_sql_quality_agent() -> ReflectionAgent:
    """创建 SQL 质量检查 Agent"""
    llm = HelloAgentsLLM()
    return ReflectionAgent(
        name="sql-quality-checker",
        llm=llm,
        system_prompt="""你是一个 MySQL 数据库专家，专注于 SQL 质量审查。

生成 SQL 时，考虑：
- 使用参数化查询避免 SQL 注入
- 添加合适的 LIMIT 防止全表扫描
- 使用索引字段作为 WHERE 条件

反思 SQL 时，检查以下问题（发现任意一个则给出修改建议）：
1. 是否存在笛卡尔积（缺少 JOIN 条件）
2. SELECT * 是否可以改为指定字段
3. 是否缺少 LIMIT 限制（全表扫描风险）
4. WHERE 条件是否用了函数（导致索引失效，如 WHERE YEAR(created_at) = 2024）
5. 是否存在 N+1 查询模式

如果 SQL 质量良好，回复"无需改进"。""",
        max_iterations=2,
    )


if __name__ == "__main__":
    agent = create_sql_quality_agent()

    # 场景：生成一个有潜在问题的查询
    query_request = """
    数据库表结构：
    - orders (id, user_id, status, amount, created_at, updated_at)
    - users (id, name, email, vip_level, created_at)

    需求：查询 VIP 等级为 3 以上、最近 30 天内有下单但未完成支付的用户，
    按订单金额降序排列，只取前 20 条，需要用户姓名和邮箱。
    """

    result = agent.run(f"请为以下需求生成 MySQL 查询 SQL：\n{query_request}")
    print("=== 最终优化后的 SQL ===")
    print(result)
```

## ✅ 本章小结

**本章依赖**：
- 依赖第3章的 **`invoke` 同步接口**：`_execute_task`、`_reflect_on_result`、`_refine_result` 三个阶段都通过 `invoke` 同步调用 LLM
- 依赖第1章的**感知-决策-执行循环**：Reflection 本质上是在执行循环外套了一层"质量验证循环"

**后续应用**：
- 本章的 **Memory 模块**（工作记忆 vs 持久会话）思想在第9章 SessionStore 中得到工程化：`SessionStore` 提供跨轮次的持久化能力，而 `Memory` 只在单次任务生命周期内存活
- 本章的 **`max_iterations` 防无限循环**设计思想在第10章熔断器中得到升级：CircuitBreaker 从"次数限制"演化为"失败率驱动的动态熔断"
- 本章的 **Reflection 范式**在第13–15章企业实战中可选择性地叠加在 ReAct 或 Plan-Solve 之上，形成"生成 → 验证 → 修正"的高质量输出管道
