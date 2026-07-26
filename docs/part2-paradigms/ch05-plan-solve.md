---
title: 第5章 Plan-Solve 范式
description: 掌握任务分解与二阶段执行，构建能处理复杂任务的 Plan-Solve Agent
---

# 第5章 Plan-Solve 范式

## 🗺️ 在知识体系中的位置

<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0;font-family:sans-serif;font-size:13px">
<a href="/part1-foundation/ch03-llm-basics" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第3章 LLM 基础</a>
<span style="color:#94a3b8;font-size:16px">→</span>
<span style="background:#3b82f6;color:#fff;padding:6px 14px;border-radius:8px;font-weight:700;border:2px solid #1d4ed8">第5章 Plan-Solve</span>
<span style="color:#94a3b8;font-size:16px">→</span>
<a href="/part4-enterprise/ch14-data-query-agent" style="background:#f8fafc;color:#3b82f6;padding:6px 14px;border-radius:8px;border:1.5px solid #bfdbfe;text-decoration:none">第14章 数据查询实战</a>
</div>

本章介绍三大范式的第二种：Plan-Solve。与 ReAct 的"边思考边行动"不同，Plan-Solve 先生成完整计划再逐步执行，适合结构清晰的确定性任务。第14章数据查询 Agent 综合运用了本章的 Plan-Solve 范式。

## 🎯 本章你能学到什么

- 能说明 Plan-Solve 与 ReAct 的核心区别：先规划全局 vs 逐步推进
- 能从 `plan_solve_agent.py` 源码中识别 `Planner` 和 `Executor` 的职责分工
- 能说明为什么 `Planner` 用 `tool_choice: "required"` 强制输出结构化计划
- 能用 Java 视角理解多步骤任务链与 `CompletableFuture.thenCompose` 的对应关系
- 能独立构建一个代码审查 Agent

## 📖 核心概念

### Plan-Solve 的核心思想

**结论**：Plan-Solve 将任务分为两个明确阶段——**规划（Plan）**：生成完整的步骤列表；**执行（Solve）**：按步骤顺序执行，每步结果作为下一步的上下文。

与 ReAct 的逐步交替推理不同，Plan-Solve 的计划在第一步就完全生成。这带来两个优势：1）每个执行步骤的 Prompt 更简洁（有明确任务目标）；2）步骤间的依赖关系更清晰，便于调试。

**适用场景**：任务结构清晰且步骤可预测的场景，如：代码审查、报告生成、数据处理管道、多步骤查询。

**不适用场景**：需要根据中间结果动态调整策略的探索性任务——这时应该用 ReAct。

### Planner：用 Function Calling 强制输出结构化计划

```python
# 来源: hello_agents/agents/plan_solve_agent.py — Planner.plan 方法
def plan(self, question: str, **kwargs) -> List[str]:
    """生成执行计划（使用 Function Calling 确保输出格式）"""

    # 定义计划生成工具：强制 LLM 输出步骤列表而非自由文本
    plan_tool = {
        "type": "function",
        "function": {
            "name": "generate_plan",
            "description": "生成解决问题的分步计划",
            "parameters": {
                "type": "object",
                "properties": {
                    "steps": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "按顺序排列的执行步骤列表"  # 结构化输出
                    }
                },
                "required": ["steps"]
            }
        }
    }

    response = self.llm_client.invoke_with_tools(
        messages=messages,
        tools=[plan_tool],
        # "required" = 强制调用此工具，LLM 不能选择输出自由文本
        # 对应 Java 中的强类型返回值，而非 String
        tool_choice={"type": "function", "function": {"name": "generate_plan"}},
    )

    if response.tool_calls:
        arguments = json.loads(response.tool_calls[0].arguments)
        return arguments.get("steps", [])  # 返回结构化步骤列表
```

::: tip ⚙️ 工程技巧：`tool_choice: "required"` 等价于强类型返回

`tool_choice: "required"` 强制 LLM 必须调用指定工具，相当于在 Java 中将方法返回值从 `Object`（自由文本）改为 `List<String>`（结构化列表）。工程上，永远应该用结构化输出替代文本解析——这是 Plan-Solve 在计划生成阶段的关键工程决策。
:::

### Executor：按计划逐步执行

```python
# 来源: hello_agents/agents/plan_solve_agent.py — Executor.execute 方法
def execute(self, question: str, plan: List[str], **kwargs) -> str:
    """按计划执行任务，每步结果作为下一步的上下文"""
    history = []  # 记录已完成步骤的结果

    for i, step in enumerate(plan, 1):
        print(f"-> 执行步骤 {i}/{len(plan)}: {step}")

        # 每步 Prompt 包含：原问题 + 完整计划 + 历史结果 + 当前步骤
        # 这确保每步 LLM 都有完整上下文，不会"迷失"
        context = f"""# 原始问题: {question}
# 完整计划: {self._format_plan(plan)}
# 历史步骤与结果: {self._format_history(history) if history else "无"}
# 当前步骤: {step}
请执行当前步骤并给出结果。"""

        response_text = self._execute_step(context, **kwargs)
        history.append({"step": step, "result": response_text})  # 累积上下文

    return history[-1]["result"]  # 最后一步的结果即为最终答案
```

### PlanSolveAgent：组合 Planner + Executor

```python
# 来源: hello_agents/agents/plan_solve_agent.py — PlanSolveAgent.run 方法
def run(self, input_text: str, **kwargs) -> str:
    """运行 Plan and Solve Agent：先规划，再执行"""

    # 阶段 1：生成计划（结构化，不可省略）
    plan = self.planner.plan(input_text, **kwargs)
    if not plan:
        return "无法生成有效的行动计划，任务终止。"

    # 阶段 2：按计划执行（顺序执行，累积上下文）
    final_answer = self.executor.execute(input_text, plan, **kwargs)

    # 保存到会话历史（用于第9章 SessionStore 的持久化）
    self.add_message(Message(input_text, "user"))
    self.add_message(Message(final_answer, "assistant"))

    return final_answer
```

::: details ☕ Java 对比：多步骤任务链 vs `CompletableFuture.thenCompose`

Plan-Solve 的"步骤1的结果 → 步骤2的输入"这种顺序依赖，在 Java 中用 `CompletableFuture.thenCompose` 表达最为自然：

```python
# Python：Plan-Solve 顺序执行（同步）
results = []
for step in plan:
    result = executor.execute_step(step, context=results)
    results.append(result)
final = results[-1]
```

```java
// Java 等价：CompletableFuture 顺序链（异步）
CompletableFuture<String> chain = CompletableFuture.completedFuture("");

for (String step : plan) {
    // thenCompose 确保上一步完成后才执行下一步，等价于 Plan-Solve 的顺序依赖
    chain = chain.thenCompose(prevResult ->
        executor.executeStepAsync(step, prevResult)
    );
}

String finalAnswer = chain.get();
```

Python 的同步顺序循环与 Java 的 `thenCompose` 链在语义上完全等价——都是"前一步结果 → 后一步输入"的有序管道。
:::

## 💻 代码实战

完整展示 `PlanSolveAgent` 的初始化和执行流程：

```python
# 来源: hello_agents/agents/plan_solve_agent.py (PlanSolveAgent, Planner, Executor)
from hello_agents.agents.plan_solve_agent import PlanSolveAgent
from hello_agents.core.llm import HelloAgentsLLM

# 初始化：LLM 客户端 + 可选工具注册表
llm = HelloAgentsLLM()
agent = PlanSolveAgent(
    name="code-reviewer",
    llm=llm,
    # planner_prompt 可以定制规划器的系统角色
    planner_prompt="你是一个代码审查规划专家，将代码审查任务分解为清晰的检查步骤。",
    # executor_prompt 可以定制执行器的系统角色
    executor_prompt="你是一个严格的代码审查执行者，按步骤输出详细的审查意见。",
)

# 执行：Plan-Solve 会自动完成 规划 → 执行 两阶段
result = agent.run("请审查以下 Java 代码：\n```java\npublic void saveUser(User user) { db.save(user); }\n```")
print(result)
```

## 🏢 企业场景落地

Java 后端的代码审查流程通常需要检查多个维度：安全性（SQL 注入/XSS）、性能（N+1 查询）、可维护性（命名规范）、测试覆盖等。这是一个天然的多步骤任务，非常适合 Plan-Solve 范式。

```python
# 来源依赖: hello_agents/agents/plan_solve_agent.py (PlanSolveAgent)
# 企业场景：Java 代码自动审查 Agent
from hello_agents.agents.plan_solve_agent import PlanSolveAgent
from hello_agents.core.llm import HelloAgentsLLM


def create_code_review_agent() -> PlanSolveAgent:
    """创建代码审查 Agent"""
    llm = HelloAgentsLLM()
    return PlanSolveAgent(
        name="java-code-reviewer",
        llm=llm,
        planner_prompt="""你是一个专业的 Java 代码审查规划师。
将代码审查任务分解为以下固定步骤：
1. 安全漏洞检查（SQL注入、XSS、权限校验）
2. 性能问题检查（N+1查询、不必要的全表扫描、缺少缓存）
3. 代码规范检查（命名规范、注释完整性、方法长度）
4. 测试覆盖建议（缺少的单元测试场景）
5. 综合评分与改进建议""",
        executor_prompt="""你是一个严格的 Java 高级工程师，负责执行代码审查的具体步骤。
每步输出格式：【问题列表】+ 【严重程度：高/中/低】+ 【修复建议】""",
    )


if __name__ == "__main__":
    # 模拟需要审查的 Java 代码
    code_to_review = """
    @RestController
    public class UserController {
        @Autowired
        private UserRepository userRepo;

        @GetMapping("/user")
        public User getUser(String name) {
            // 直接用 name 拼接查询，有 SQL 注入风险
            return userRepo.findByName(name);
        }

        @PostMapping("/users/batch")
        public void batchProcess(List<Long> userIds) {
            // N+1 查询问题：每个 userId 都触发一次数据库查询
            for (Long id : userIds) {
                User user = userRepo.findById(id).orElse(null);
                processUser(user);
            }
        }
    }
    """

    agent = create_code_review_agent()
    review_result = agent.run(f"请对以下 Java 代码进行全面审查：\n```java\n{code_to_review}\n```")
    print("=== 代码审查报告 ===")
    print(review_result)
```

## ✅ 本章小结

**本章依赖**：
- 依赖第3章的 **`invoke_with_tools` 接口**：`Planner` 使用 `tool_choice: "required"` 强制 LLM 输出结构化计划
- 依赖第3章的 **`invoke` 同步接口**：`Executor` 在每个步骤中同步调用 LLM

**后续应用**：
- 本章的 **Planner + Executor 分离架构**在第14章数据查询 Agent 中得到完整应用：Planner 生成 SQL 查询步骤，Executor 结合 SessionStore 实现多轮修正
- 本章的**步骤历史累积上下文**思想在第8章上下文工程中被系统化：`ContextBuilder` 的 GSSC 流水线是这种上下文管理的工程化升级
