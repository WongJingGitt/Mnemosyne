# Mnemosyne

> 个人记忆 MCP Server - 基于 Model Context Protocol 的长期记忆管理服务

## 🎯 项目概述

Mnemosyne 是一个基于 MCP（Model Context Protocol）的个人记忆服务，使用 Node.js 和 SQLite 实现。它允许 AI 助手（如 Claude）存储和检索用户的个人信息、生活事件、实体关系等，从而提供更加个性化和连贯的对话体验。

### 核心特性

- ✅ **结构清晰**：实体-事件-属性三层模型，易于理解和使用
- ✅ **模型友好**：主流 AI 模型都能轻松调用
- ✅ **轻量部署**：基于 SQLite（纯 JS 实现），单文件存储，**零编译依赖**
- ✅ **跨平台兼容**：无需 C++ 编译工具，支持 Windows/macOS/Linux
- ✅ **多用户支持**：支持单用户/多用户场景
- ✅ **数据持久化**：默认存储在用户目录，数据安全可靠
- ✅ **远程同步**：可选的 Git 同步功能，支持跨设备数据共享

## 🚀 快速开始

### 安装

```bash
# 克隆或进入项目目录
cd Mnemosyne

# 安装依赖（无需 C++ 编译工具！）
npm install

# 运行测试
npm test
```

**注意**：本项目使用 `sql.js`（纯 JavaScript 实现的 SQLite），无需安装 Visual Studio、Xcode 或 build-essential 等 C++ 编译工具。

### 启动服务

```bash
# 使用默认配置启动
npm start

# 或指定自定义参数
node src/index.js --db-path /custom/path/memory.db --user-id your_user_id
```

### 与 Claude Desktop 集成

编辑 Claude Desktop 配置文件：
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

添加以下配置：

```json
{
  "mcpServers": {
    "personal-memory": {
      "command": "node",
      "args": ["D:\\Project\\Mnemosyne\\src\\index.js"]
    }
  }
}
```

重启 Claude Desktop 即可使用。

## 📁 数据存储

### 默认位置

SQLite 数据库默认存储在：
- **Windows**: `C:\Users\<用户名>\.mnemosyne\memory.db`
- **macOS/Linux**: `~/.mnemosyne/memory.db`

### 数据库特性

- ✅ 如果数据库文件已存在，自动读取，不会重新创建表
- ✅ 使用 WAL 模式提高并发性能
- ✅ 支持 JSON 字段存储复杂属性
- ✅ 完整的索引优化

## 🔧 可用工具

### 用户属性管理

| 工具 | 描述 |
|------|------|
| `update_profile` | 更新或添加用户基础信息 |
| `query_profile` | 查询用户信息 |
| `delete_profile` | 删除用户属性 |

### 实体管理

| 工具 | 描述 |
|------|------|
| `create_entity` | 创建实体（宠物、房产、车辆、人） |
| `update_entity` | 更新实体信息 |
| `list_entities` | 列出所有实体 |
| `delete_entity` | 删除实体（软删除） |

### 事件管理

| 工具 | 描述 |
|------|------|
| `add_event` | 记录新事件 |
| `search_events` | 搜索历史事件 |
| `query_entity_timeline` | 查询实体时间线 |

## 💡 使用示例

### 场景 1：个人信息管理

```
用户："我在北京的字节跳动上班"

AI 调用：
→ update_profile(key="workplace", value="字节跳动", category="basic_info")
→ update_profile(key="work_location", value="北京", category="basic_info")
```

### 场景 2：宠物管理

```
用户："我养了只金毛叫旺财"

AI 调用：
→ create_entity(entity_type="pet", name="旺财", attributes={"breed": "金毛"})
→ 返回 entity_id = 1

用户："旺财昨天生病了，花了2000块"

AI 调用：
→ add_event(
    event_type="illness",
    description="旺财生病就医",
    related_entity_ids=[1],
    metadata={"cost": 2000}
  )

用户："旺财最近怎么样？"

AI 调用：
→ query_entity_timeline(entity_id=1)
→ 基于时间线数据回复用户
```

## 📊 数据模型

### 用户属性 (user_profile)
- Key-Value 存储
- 支持分类：basic_info, preferences, habits
- 包含置信度和更新时间

### 实体 (entities)
- 类型：pet, property, vehicle, person
- 自定义属性（JSON 格式）
- 软删除支持

### 事件 (events)
- 类型：purchase, illness, maintenance, activity, milestone, other
- 可关联多个实体
- 支持元数据和重要性评分

## 🔄 远程同步（可选功能）

Mnemosyne 支持通过 Git 私有仓库同步数据库文件，实现跨设备数据共享。

### 初始化同步

```bash
# 初始化 Git 仓库并设置远程地址
npm run sync:init -- --remote https://github.com/your-username/mnemosyne-data.git

# 首次推送
cd ~/.mnemosyne
git push -u origin main
```

### 同步操作

```bash
# 双向同步（拉取 + 推送）
npm run sync

# 仅拉取远程更新
npm run sync:pull

# 仅推送本地更改
npm run sync:push

# 查看同步状态
npm run sync:status

# 强制同步（覆盖本地）
npm run sync -- --force
```

### 在其他设备上使用

```bash
# 克隆数据到新设备
git clone https://github.com/your-username/mnemosyne-data.git ~/.mnemosyne

# 安装 Mnemosyne
cd /path/to/Mnemosyne
npm install

# 启动服务（会自动使用已有数据库）
npm start
```

详细的同步方案请参考：[Git 同步指南](docs/GIT_SYNC.md)

## 📂 项目结构

```
Mnemosyne/
├── src/
│   ├── index.js          # MCP Server 主程序
│   ├── database.js       # 数据库管理模块
│   └── utils.js          # 工具函数
├── scripts/
│   └── sync_db.js        # Git 同步脚本
├── tests/
│   └── test_basic.js     # 基础功能测试
├── docs/
│   └── GIT_SYNC.md       # Git 同步详细文档
├── config.json           # 服务配置
├── package.json
├── README.md             # 设计文档（原始）
├── README_USAGE.md       # 使用指南
└── README_PROJECT.md     # 本文件
```

## 🧪 测试

```bash
# 运行所有测试
npm test
```

测试涵盖：
- ✅ 数据库初始化
- ✅ 用户属性 CRUD
- ✅ 实体管理
- ✅ 事件管理
- ✅ 时间线查询
- ✅ 软删除

## 🔐 安全建议

1. **使用私有 Git 仓库**：如果启用同步功能
2. **SSH 密钥认证**：比 HTTPS 更安全
3. **数据库加密**：可选，使用 SQLCipher 加密数据库
4. **定期备份**：数据库文件很小，建议定期备份

## 🛠️ 开发

### 添加新功能

1. 在 `src/database.js` 中实现数据库操作
2. 在 `src/index.js` 中注册 MCP 工具
3. 在 `tests/` 中添加测试用例
4. 更新文档

### 调试

```bash
# 启用详细日志
$env:DEBUG="*"  # PowerShell
export DEBUG="*"  # Bash

npm start
```

## 📝 技术栈

- **运行时**: Node.js (ES Modules)
- **数据库**: SQLite 3 (better-sqlite3)
- **协议**: Model Context Protocol (MCP)
- **同步**: Git（可选）

## 🤝 对比设计文档

原始设计文档使用 Python 实现，本项目使用 Node.js 完全重新实现，但保持了：
- ✅ 相同的数据模型
- ✅ 相同的 MCP 工具定义
- ✅ 相同的使用场景
- ✅ 增强的功能（Git 同步）

## 📄 许可证

ISC License

## 🔮 未来计划

- [ ] 向量检索支持（语义搜索）
- [ ] Web 管理界面
- [ ] 自动备份功能
- [ ] 数据导入/导出
- [ ] 趋势分析
- [ ] 多语言支持

## 📮 反馈

如有问题或建议，欢迎提交 Issue。

---

**注意**: 本项目基于原始设计文档 (README.md) 使用 Node.js 实现。所有核心功能已完成并通过测试。
