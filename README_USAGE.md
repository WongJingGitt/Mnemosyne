# Mnemosyne - 使用指南

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 运行测试

```bash
npm test
```

### 3. 启动 MCP Server

```bash
npm start
```

或者使用自定义参数：

```bash
node src/index.js --db-path /path/to/custom.db --user-id your_user_id
```

## 数据库位置

默认情况下，SQLite 数据库文件会存储在：
- Windows: `C:\Users\<用户名>\.mnemosyne\memory.db`
- macOS/Linux: `~/.mnemosyne/memory.db`

如果数据库文件已存在，服务器会直接使用现有数据，不会重新创建表。

## 与 Claude Desktop 集成

在 Claude Desktop 的配置文件中添加（位置：`%APPDATA%\Claude\claude_desktop_config.json` on Windows）：

```json
{
  "mcpServers": {
    "personal-memory": {
      "command": "node",
      "args": ["D:\\Project\\Mnemosyne\\src\\index.js"],
      "env": {}
    }
  }
}
```

## 可用工具

### 用户属性管理
- `update_profile` - 更新用户基础信息
- `query_profile` - 查询用户信息
- `delete_profile` - 删除用户属性

### 实体管理
- `create_entity` - 创建实体（宠物、房产、车辆、人）
- `update_entity` - 更新实体信息
- `list_entities` - 列出实体
- `delete_entity` - 删除实体（软删除）

### 事件管理
- `add_event` - 记录新事件
- `search_events` - 搜索历史事件
- `query_entity_timeline` - 查询实体时间线

## 使用示例

### 示例 1：记录个人信息
```
用户："我在北京的字节跳动上班"
→ Claude 调用: update_profile(key="workplace", value="字节跳动")
→ Claude 调用: update_profile(key="work_location", value="北京")
```

### 示例 2：管理宠物
```
用户："我养了只金毛叫旺财"
→ Claude 调用: create_entity(entity_type="pet", name="旺财", attributes={"breed": "金毛"})
→ 返回 entity_id = 1

用户："旺财昨天生病了，花了2000块"
→ Claude 调用: add_event(
    event_type="illness",
    description="旺财生病就医",
    related_entity_ids=[1],
    metadata={"cost": 2000}
  )

用户："旺财最近怎么样？"
→ Claude 调用: query_entity_timeline(entity_id=1)
→ Claude 回复基于时间线数据
```

## 项目结构

```
Mnemosyne/
├── src/
│   ├── index.js      # MCP Server 主文件
│   ├── database.js   # 数据库管理
│   └── utils.js      # 工具函数
├── tests/
│   └── test_basic.js # 基础功能测试
├── config.json       # 配置文件
├── package.json
└── README_USAGE.md   # 本文件
```

## 数据模型

### 用户属性 (user_profile)
- 简单的 Key-Value 存储
- 支持分类：basic_info, preferences, habits

### 实体 (entities)
- 类型：pet, property, vehicle, person
- 包含名称和自定义属性
- 支持软删除（status: active/inactive）

### 事件 (events)
- 类型：purchase, illness, maintenance, activity, milestone, other
- 可关联多个实体
- 支持元数据和重要性评分
- 按时间戳排序

## 开发

### 添加新功能
1. 在 `database.js` 中添加数据库操作方法
2. 在 `index.js` 中注册新的 MCP 工具
3. 在 `tests/` 中添加测试用例

### 调试
设置环境变量查看详细日志：
```bash
$env:DEBUG="*"; npm start
```

## 许可证
ISC
