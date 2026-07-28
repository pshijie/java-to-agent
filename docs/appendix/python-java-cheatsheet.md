# Python → Java 速查对照表

> 本附录面向有 Java 后端经验的开发者，帮助快速理解 HelloAgents 框架代码中的 Python 语法。

::: tip 📖 如何使用本表
当你在章节正文中看到 **☕ Java 对比** 折叠块时，点击可查看简要对比。如需**完整代码示例**和更详细的差异说明，来本附录对应分类下查看。

建议用法：遇到不熟悉的 Python 语法 → 先看正文折叠块（3 秒理解） → 仍不清楚再来本页找对应小节（2 分钟深入）。
:::

---

## 一、语法结构

### `with` 语句 vs `try-with-resources`

Python 的 `with` 语句用于管理上下文（自动执行 `__enter__` / `__exit__`），最常见的场景是文件操作和资源清理。Java 从 7 起引入 `try-with-resources`，原理类似，要求资源实现 `AutoCloseable`。两者都保证资源在离开作用域后必然被释放，无论是否抛出异常。

```python
# Python：with 语句自动关闭文件
with open("session.json", "r", encoding="utf-8") as f:
    data = f.read()
# 离开 with 块后 f 自动关闭，等价于 finally: f.close()
```

```java
// Java：try-with-resources，BufferedReader 实现 AutoCloseable
try (BufferedReader reader = new BufferedReader(new FileReader("session.json"))) {
    String data = reader.lines().collect(Collectors.joining("\n"));
} // reader.close() 自动调用
```

---

### `@decorator` vs `@Annotation + AOP`

Python 的 `@decorator` 是一个高阶函数，包裹目标函数并返回新函数，在运行时动态修改行为。Java 的 `@Annotation` 本身只是元数据标记，实际行为增强需配合 AOP（如 Spring 的 `@Around`）在代理层织入。核心区别是：Python decorator 在函数定义时立即执行包裹逻辑，而 Java AOP 在运行期通过代理拦截。

```python
# Python：@decorator 包裹函数，添加日志
import functools

def log_call(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        print(f"调用: {func.__name__}")
        result = func(*args, **kwargs)
        print(f"完成: {func.__name__}")
        return result
    return wrapper

@log_call
def process_request(data: str) -> str:
    return data.upper()
```

```java
// Java：自定义注解 + Spring AOP 实现等价增强
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface LogCall {}

@Aspect
@Component
public class LogAspect {
    @Around("@annotation(LogCall)")
    public Object around(ProceedingJoinPoint pjp) throws Throwable {
        System.out.println("调用: " + pjp.getSignature().getName());
        Object result = pjp.proceed();
        System.out.println("完成: " + pjp.getSignature().getName());
        return result;
    }
}
```

---

### `__init__` vs 构造函数

Python 类用 `__init__` 方法初始化实例属性，`self` 参数显式指向当前对象。Java 构造函数与类同名，`this` 隐式可用。两者职责完全一致：在对象创建时完成属性赋值和必要的初始化操作。Python 中还有 `__new__` 用于控制对象分配，对应 Java 自定义工厂/Builder 模式。

```python
# Python：__init__ 初始化 Agent
class ReactAgent:
    def __init__(self, name: str, max_steps: int = 10):
        self.name = name          # 实例属性赋值
        self.max_steps = max_steps
        self._history: list = []  # 私有属性（约定，非强制）

agent = ReactAgent("monitor-agent", max_steps=5)
```

```java
// Java：构造函数，等价实现
public class ReactAgent {
    private final String name;
    private final int maxSteps;
    private final List<String> history;

    public ReactAgent(String name, int maxSteps) {
        this.name = name;
        this.maxSteps = maxSteps;
        this.history = new ArrayList<>();
    }
}

ReactAgent agent = new ReactAgent("monitor-agent", 5);
```

---

## 二、异步模型

### `async/await` vs `CompletableFuture`

Python 的 `async def` 定义协程函数，`await` 暂停当前协程并将控制权交还事件循环，期间不阻塞线程。Java 的 `CompletableFuture` 基于线程池实现异步，通过 `.thenApply()` / `.thenCompose()` 链式组合异步操作。核心差异：Python 协程是单线程协作式调度，Java `CompletableFuture` 默认使用 `ForkJoinPool` 多线程并行。

```python
# Python：async/await 异步调用 LLM
import asyncio
from typing import AsyncGenerator

async def stream_llm_response(prompt: str) -> str:
    # await 暂停协程，等待 IO 完成，不阻塞事件循环
    response = await llm_client.ainvoke(prompt)
    return response.content

async def run_agent_loop(query: str) -> str:
    result = await stream_llm_response(query)
    return result

# 启动事件循环
asyncio.run(run_agent_loop("分析日志中的异常"))
```

```java
// Java：CompletableFuture 链式异步调用
import java.util.concurrent.CompletableFuture;

public CompletableFuture<String> streamLlmResponse(String prompt) {
    // thenApply 在异步结果就绪后回调，等价于 await 后的代码
    return llmClient.invokeAsync(prompt)
        .thenApply(response -> response.getContent());
}

public CompletableFuture<String> runAgentLoop(String query) {
    return streamLlmResponse(query);
}

// 阻塞等待结果（等价于 asyncio.run）
String result = runAgentLoop("分析日志中的异常").get();
```

---

## 三、类型系统

### `list[str]` vs `List<String>`

Python 从 3.9 起支持内置泛型语法 `list[str]`（旧版用 `List[str]` from `typing`），仅作静态类型提示，运行时不强制检查。Java 的 `List<String>` 在编译期强制类型安全，运行时因类型擦除退化为原始 `List`。两者都是"容器 + 元素类型"的泛型表达，但 Python 类型提示是可选的，Java 泛型是强制的。

```python
# Python：list[str] 类型注解（Python 3.9+）
from typing import Optional

def get_tool_names(tool_ids: list[str]) -> list[str]:
    return [tid.upper() for tid in tool_ids]

# 旧版写法（Python 3.8 及以下）
from typing import List
def get_tool_names_legacy(tool_ids: List[str]) -> List[str]:
    return [tid.upper() for tid in tool_ids]
```

```java
// Java：List<String> 编译期类型安全
import java.util.List;
import java.util.stream.Collectors;

public List<String> getToolNames(List<String> toolIds) {
    return toolIds.stream()
        .map(String::toUpperCase)
        .collect(Collectors.toList());
}
```

---

### `dict` vs `HashMap`

Python 的 `dict` 是内置字典类型，从 3.7 起保证插入顺序，支持任意可哈希类型作 key。Java 的 `HashMap` 不保证顺序（需用 `LinkedHashMap`），且 key 必须实现 `hashCode()` 和 `equals()`。在 Agent 框架中，`dict` 常用于存储工具注册表、消息元数据等键值映射，对应 Java 中的 `Map<String, Object>`。

```python
# Python：dict 存储工具注册表
tool_registry: dict[str, callable] = {}

def register_tool(name: str, func: callable) -> None:
    tool_registry[name] = func

# dict comprehension（字典推导式）
tool_names = {k: v.__name__ for k, v in tool_registry.items()}

# defaultdict 提供缺失 key 的默认值
from collections import defaultdict
failure_counts: defaultdict[str, int] = defaultdict(int)
failure_counts["api_tool"] += 1  # key 不存在时默认为 0
```

```java
// Java：HashMap 等价实现
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

Map<String, Supplier<Object>> toolRegistry = new HashMap<>();

public void registerTool(String name, Supplier<Object> func) {
    toolRegistry.put(name, func);
}

// 等价 defaultdict：getOrDefault 或 computeIfAbsent
Map<String, Integer> failureCounts = new ConcurrentHashMap<>();
failureCounts.merge("api_tool", 1, Integer::sum); // 不存在则插入 1，存在则累加
```

---

### `Optional[X]` vs `Optional<X>`

Python 的 `Optional[X]` 等价于 `Union[X, None]`，是类型提示，不提供运行时保护，可以随时传 `None` 而不报错。Java 的 `Optional<X>` 是真正的容器类，强制调用者显式处理"值可能不存在"的情况，避免 `NullPointerException`。两者语义相似，但 Java `Optional` 有方法调用开销，Python `Optional` 零开销。

```python
# Python：Optional[X] 类型提示，运行时仍需自己判断 None
from typing import Optional

def find_session(session_id: str) -> Optional[dict]:
    sessions = load_sessions()
    return sessions.get(session_id)  # 返回 None 或 dict

session = find_session("sess-001")
if session is not None:
    print(session["user"])
```

```java
// Java：Optional<T> 容器，强制处理空值
import java.util.Optional;

public Optional<Map<String, Object>> findSession(String sessionId) {
    Map<String, Object> session = loadSessions().get(sessionId);
    return Optional.ofNullable(session);
}

Optional<Map<String, Object>> session = findSession("sess-001");
session.ifPresent(s -> System.out.println(s.get("user")));
// 或链式处理
String user = session.map(s -> (String) s.get("user")).orElse("anonymous");
```

---

### `@dataclass` vs `@Data (Lombok)`

Python 的 `@dataclass` 装饰器自动生成 `__init__`、`__repr__`、`__eq__` 等方法，减少样板代码。Java 的 Lombok `@Data` 注解在编译期自动生成 getter/setter、`toString()`、`equals()`、`hashCode()` 和全参构造函数，原理相同。`@dataclass(frozen=True)` 对应 Lombok 的 `@Value`（不可变对象）。

```python
# Python：@dataclass 自动生成初始化和比较方法
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class ToolResponse:
    success: bool
    content: str
    error: Optional[str] = None
    metadata: dict = field(default_factory=dict)  # 可变默认值必须用 field

# 自动生成：__init__, __repr__, __eq__
resp = ToolResponse(success=True, content="查询结果：共 42 条记录")
print(resp)  # ToolResponse(success=True, content='查询结果：共 42 条记录', ...)
```

```java
// Java：Lombok @Data 等价实现
import lombok.Data;
import lombok.Builder;
import java.util.Map;
import java.util.HashMap;

@Data
@Builder
public class ToolResponse {
    private boolean success;
    private String content;
    private String error;        // null 表示无错误
    @Builder.Default
    private Map<String, Object> metadata = new HashMap<>();
}

// 自动生成：构造函数、getter/setter、toString、equals、hashCode
ToolResponse resp = ToolResponse.builder()
    .success(true)
    .content("查询结果：共 42 条记录")
    .build();
```

---

## 四、设计模式

### `ABC / abstractmethod` vs `interface / abstract class`

Python 通过 `abc` 模块的 `ABC` 基类和 `@abstractmethod` 装饰器定义抽象类，子类必须实现所有抽象方法，否则实例化时抛 `TypeError`。Java 用 `interface` 定义纯契约（Java 8 后支持 `default` 方法），`abstract class` 可包含部分实现。Python 没有 `interface` 和 `abstract class` 的语法区分，统一用 ABC 实现。

```python
# Python：ABC + @abstractmethod 定义 Agent 基类
from abc import ABC, abstractmethod
from typing import AsyncGenerator

class BaseAgent(ABC):
    def __init__(self, name: str):
        self.name = name

    @abstractmethod
    async def run(self, query: str) -> str:
        """子类必须实现此方法，否则无法实例化"""
        ...

    @abstractmethod
    async def astream(self, query: str) -> AsyncGenerator[str, None]:
        ...

    def get_name(self) -> str:  # 非抽象方法，提供默认实现
        return self.name

class ReactAgent(BaseAgent):
    async def run(self, query: str) -> str:
        return f"ReAct 执行: {query}"

    async def astream(self, query: str) -> AsyncGenerator[str, None]:
        yield f"ReAct 流式: {query}"
```

```java
// Java：interface 定义契约 + abstract class 提供部分实现
public interface AgentContract {
    String run(String query) throws Exception;
    // Java 8+ default 方法
    default String getName() { return "unnamed"; }
}

public abstract class BaseAgent implements AgentContract {
    protected final String name;

    public BaseAgent(String name) {
        this.name = name;
    }

    @Override
    public String getName() { return name; } // 覆写 default
    // run() 留给子类实现（abstract）
}

public class ReactAgent extends BaseAgent {
    public ReactAgent(String name) { super(name); }

    @Override
    public String run(String query) {
        return "ReAct 执行: " + query;
    }
}
```

---

## 五、标准库对应

### `yield / generator` vs `Stream / Iterator`

Python 的 `yield` 关键字将普通函数变为生成器（generator），每次调用 `next()` 执行到下一个 `yield` 暂停，实现惰性求值。Java 的 `Stream` 提供类似的惰性管道操作（`filter`、`map`、`flatMap`），终端操作（`collect`、`forEach`）才真正触发计算。对于需要精确控制迭代步骤的场景，Java 用 `Iterator` 或 `Spliterator` 更贴近 Python generator 语义。

```python
# Python：yield 生成器，惰性产出 Agent 执行步骤
from typing import Generator

def agent_steps(query: str, max_steps: int = 5) -> Generator[dict, None, None]:
    for step in range(max_steps):
        thought = f"第 {step+1} 步思考: {query}"
        yield {"step": step, "thought": thought}  # 暂停并产出，不计算下一步
        if "完成" in thought:
            return  # 提前结束生成器

# 惰性消费：只在需要时才执行
for step_info in agent_steps("查询数据库"):
    print(step_info)
    if step_info["step"] >= 2:
        break  # 不会触发后续 yield
```

```java
// Java：Stream 惰性管道，等价于 generator 的惰性求值
import java.util.stream.IntStream;
import java.util.stream.Stream;

public Stream<Map<String, Object>> agentSteps(String query, int maxSteps) {
    return IntStream.range(0, maxSteps)
        .mapToObj(step -> {
            Map<String, Object> info = new HashMap<>();
            info.put("step", step);
            info.put("thought", "第 " + (step + 1) + " 步思考: " + query);
            return info;
        })
        .takeWhile(info -> !((String) info.get("thought")).contains("完成"));
}

// 消费（等价于 for...in）
agentSteps("查询数据库", 5)
    .limit(3)
    .forEach(System.out::println);
```

---

### `defaultdict` vs `ConcurrentHashMap`

Python 的 `defaultdict` 在访问不存在的 key 时自动调用工厂函数生成默认值，常用于计数器（`defaultdict(int)`）和分组（`defaultdict(list)`）。Java 的 `ConcurrentHashMap` 配合 `computeIfAbsent` / `merge` 方法实现等价语义，同时提供线程安全保证，适合多线程 Agent 并发场景。

```python
# Python：defaultdict 自动初始化，常见于熔断器失败计数
from collections import defaultdict
from typing import DefaultDict

class CircuitBreakerStats:
    def __init__(self):
        # defaultdict(int) 访问不存在的 key 时返回 0
        self.failure_counts: DefaultDict[str, int] = defaultdict(int)
        # defaultdict(list) 访问不存在的 key 时返回空列表
        self.error_logs: DefaultDict[str, list] = defaultdict(list)

    def record_failure(self, tool_name: str, error: str) -> None:
        self.failure_counts[tool_name] += 1      # key 不存在时从 0 开始累加
        self.error_logs[tool_name].append(error)  # key 不存在时自动创建空列表
```

```java
// Java：ConcurrentHashMap + merge/computeIfAbsent，线程安全等价实现
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.List;
import java.util.ArrayList;

public class CircuitBreakerStats {
    // 等价 defaultdict(int)，线程安全
    private final ConcurrentHashMap<String, AtomicInteger> failureCounts
        = new ConcurrentHashMap<>();
    // 等价 defaultdict(list)
    private final ConcurrentHashMap<String, List<String>> errorLogs
        = new ConcurrentHashMap<>();

    public void recordFailure(String toolName, String error) {
        // computeIfAbsent：key 不存在则创建，等价于 defaultdict 工厂
        failureCounts.computeIfAbsent(toolName, k -> new AtomicInteger(0))
                     .incrementAndGet();
        errorLogs.computeIfAbsent(toolName, k -> new ArrayList<>())
                 .add(error);
    }
}
```

---

### `dataclasses.field` vs `@Builder (Lombok)`

Python `dataclasses.field()` 用于为 `@dataclass` 字段声明复杂默认值（可变对象必须用 `field(default_factory=...)`）、字段别名、是否参与比较等高级配置。Lombok 的 `@Builder` 提供流式构建器模式，`@Builder.Default` 注解等价 `field(default_factory=...)`，两者都解决了"构造函数参数过多"的可读性问题。

```python
# Python：dataclasses.field 控制字段行为
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class AgentConfig:
    name: str
    max_steps: int = 10
    # 可变默认值必须用 field(default_factory=...)，不能直接写 = []
    tools: list[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    # repr=False 不显示在 __repr__ 中（如密钥等敏感字段）
    api_key: Optional[str] = field(default=None, repr=False)
    # compare=False 不参与 __eq__ 比较
    created_at: float = field(default=0.0, compare=False)

config = AgentConfig(name="api-gateway-agent", tools=["http_tool", "db_tool"])
```

```java
// Java：Lombok @Builder + @Builder.Default 等价实现
import lombok.Builder;
import lombok.ToString;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.HashMap;

@Builder
@ToString(exclude = "apiKey")   // 等价 field(repr=False)
public class AgentConfig {
    private String name;

    @Builder.Default
    private int maxSteps = 10;

    @Builder.Default
    private List<String> tools = new ArrayList<>();  // 等价 field(default_factory=list)

    @Builder.Default
    private Map<String, Object> metadata = new HashMap<>();

    private String apiKey;  // 敏感字段，@ToString 排除

    @Builder.Default
    private double createdAt = 0.0;
}

AgentConfig config = AgentConfig.builder()
    .name("api-gateway-agent")
    .tools(List.of("http_tool", "db_tool"))
    .build();
```
