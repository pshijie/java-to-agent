import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
    defineConfig({
        title: 'Agent 工程师成长手册',
        description: '面向 Java 后端工程师的 Agent 开发完整指南',
        lang: 'zh-CN',
        base: '/',
        themeConfig: {
            logo: '🤖',
            nav: [
                { text: '基础认知', link: '/part1-foundation/ch01-what-is-agent' },
                { text: '三大范式', link: '/part2-paradigms/ch04-react' },
                { text: '框架工程化', link: '/part3-engineering/ch07-tool-system' },
                { text: '企业落地', link: '/part4-enterprise/ch13-api-gateway-agent' },
                { text: '附录', link: '/appendix/python-java-cheatsheet' },
            ],
            sidebar: {
                '/part1-foundation/': [
                    {
                        text: 'Part 1：Agent 基础认知',
                        collapsed: false,
                        items: [
                            { text: '第1章 初识智能体', link: '/part1-foundation/ch01-what-is-agent' },
                            { text: '第2章 智能体发展史', link: '/part1-foundation/ch02-agent-history' },
                            { text: '第3章 LLM 基础', link: '/part1-foundation/ch03-llm-basics' },
                        ],
                    },
                ],
                '/part2-paradigms/': [
                    {
                        text: 'Part 2：三大 Agent 范式',
                        collapsed: false,
                        items: [
                            { text: '第4章 ReAct 范式', link: '/part2-paradigms/ch04-react' },
                            { text: '第5章 Plan-Solve 范式', link: '/part2-paradigms/ch05-plan-solve' },
                            { text: '第6章 Reflection 范式', link: '/part2-paradigms/ch06-reflection' },
                        ],
                    },
                ],
                '/part3-engineering/': [
                    {
                        text: 'Part 3：框架工程化',
                        collapsed: false,
                        items: [
                            { text: '第7章 工具系统', link: '/part3-engineering/ch07-tool-system' },
                            { text: '第8章 上下文工程', link: '/part3-engineering/ch08-context-engineering' },
                            { text: '第9章 会话持久化', link: '/part3-engineering/ch09-session-persistence' },
                            { text: '第10章 熔断器', link: '/part3-engineering/ch10-circuit-breaker' },
                            { text: '第11章 子代理机制', link: '/part3-engineering/ch11-sub-agent' },
                            { text: '第12章 可观测性', link: '/part3-engineering/ch12-observability' },
                        ],
                    },
                ],
                '/part4-enterprise/': [
                    {
                        text: 'Part 4：企业落地实战',
                        collapsed: false,
                        items: [
                            { text: '第13章 API 网关 Agent 实战', link: '/part4-enterprise/ch13-api-gateway-agent' },
                            { text: '第14章 数据查询 Agent 实战', link: '/part4-enterprise/ch14-data-query-agent' },
                            { text: '第15章 多 Agent 系统实战', link: '/part4-enterprise/ch15-multi-agent-system' },
                        ],
                    },
                ],
                '/appendix/': [
                    {
                        text: '附录',
                        collapsed: false,
                        items: [
                            { text: 'Python → Java 速查对照表', link: '/appendix/python-java-cheatsheet' },
                            { text: '术语表', link: '/appendix/glossary' },
                        ],
                    },
                ],
            },
            socialLinks: [
                { icon: 'github', link: 'https://github.com/pshijie/java-to-agent' }
            ],
            footer: {
                message: 'Agent 工程师成长手册 — 面向 Java 后端工程师',
            },
            search: {
                provider: 'local',
            },
        },
        mermaid: {
            theme: 'default',
        },
        mermaidPlugin: {
            class: 'mermaid',
        },
        vite: {
            ssr: {
                noExternal: ['mermaid', 'vitepress-plugin-mermaid'],
            },
        },
    })
)
