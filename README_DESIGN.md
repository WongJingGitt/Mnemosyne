# 个人记忆 MCP Server 设计文档

## 项目概述

### 目标
构建一个基于 MCP（Model Context Protocol）的长期记忆服务，用于存储和管理用户的个人信息、生活事件、实体关系等，使 AI 模型能够更好地了解用户。

### 核心特性
- **结构清晰**：采用实体-事件模型，而非复杂的图结构
- **模型友好**：主流模型（Claude、GPT-4、DeepSeek、通义、豆包）都能轻松使用
- **轻量部署**：基于 SQLite，单文件存储，零外部依赖
- **多用户支持**：支持单用户/多用户场景

---

## 数据模型设计

### 核心概念

#### 1. 用户属性（User Profile）
简单的 Key-Value 存储，用于存储用户的基础信息。

**适用场景**：
- 工作地点、职业
- 饮食偏好、兴趣爱好
- 生活习惯

#### 2. 实体（Entity）
有生命周期的"东西"，可以关联多个事件。

**适用场景**：
- 宠物（狗、猫）
- 资产（房产、车辆）
- 重要的人（家人、朋友、同事）

#### 3. 事件（Event）
发生在某个时间点的事情，可以关联零个或多个实体。

**适用场景**：
- 购买行为（买房、买车）
- 生活事件（宠物生病、车辆保养）
- 重要时刻（搬家、换工作）

### 数据库 Schema

```sql
-- 用户基础信息表
CREATE TABLE user_profile (
    user_id TEXT NOT NULL DEFAULT 'default',
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    category TEXT,                    -- basic_info, preferences, habits
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confidence REAL DEFAULT 1.0,      -- 信息置信度（0-1）
    PRIMARY KEY (user_id, key)
);

-- 实体表
CREATE TABLE entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'default',
    entity_type TEXT NOT NULL,        -- pet, property, vehicle, person
    name TEXT,                         -- 实体名称
    attributes TEXT,                   -- JSON 格式的属性
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active'       -- active, inactive
);

-- 事件表
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'default',
    event_type TEXT NOT NULL,          -- purchase, illness, maintenance, activity, milestone
    description TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    related_entity_ids TEXT,           -- JSON 数组，如 "[1, 2]"
    metadata TEXT,                     -- JSON 格式的额外信息
    importance REAL DEFAULT 0.5        -- 重要性评分 0-1
);

-- 实体关系表（可选）
CREATE TABLE entity_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'default',
    entity_id_1 INTEGER NOT NULL,
    entity_id_2 INTEGER NOT NULL,
    relation_type TEXT NOT NULL,       -- owns, lives_at, works_with
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entity_id_1) REFERENCES entities(id),
    FOREIGN KEY (entity_id_2) REFERENCES entities(id)
);

-- 索引优化
CREATE INDEX idx_entities_user_type ON entities(user_id, entity_type);
CREATE INDEX idx_events_user_time ON events(user_id, timestamp);
CREATE INDEX idx_events_entity ON events(user_id, related_entity_ids);
```

---

## MCP Tools 定义

### 1. 用户属性管理

#### update_profile
更新用户基础信息。

```json
{
  "name": "update_profile",
  "description": "更新或添加用户的基础信息，如工作地点、爱好、习惯等",
  "inputSchema": {
    "type": "object",
    "properties": {
      "key": {
        "type": "string",
        "description": "属性键名，如 'workplace', 'favorite_food'"
      },
      "value": {
        "type": "string",
        "description": "属性值"
      },
      "category": {
        "type": "string",
        "enum": ["basic_info", "preferences", "habits"],
        "description": "属性分类"
      }
    },
    "required": ["key", "value"]
  }
}
```

#### query_profile
查询用户信息。

```json
{
  "name": "query_profile",
  "description": "查询用户的基础信息，支持按键名或分类筛选",
  "inputSchema": {
    "type": "object",
    "properties": {
      "keys": {
        "type": "array",
        "items": {"type": "string"},
        "description": "要查询的键名列表（可选）"
      },
      "category": {
        "type": "string",
        "description": "按分类查询（可选）"
      }
    }
  }
}
```

#### delete_profile
删除用户属性。

```json
{
  "name": "delete_profile",
  "description": "删除指定的用户属性",
  "inputSchema": {
    "type": "object",
    "properties": {
      "key": {
        "type": "string",
        "description": "要删除的属性键名"
      }
    },
    "required": ["key"]
  }
}
```

---

### 2. 实体管理

#### create_entity
创建新实体（宠物、房产、车辆等）。

```json
{
  "name": "create_entity",
  "description": "创建新的实体，如宠物、房产、车辆、重要的人",
  "inputSchema": {
    "type": "object",
    "properties": {
      "entity_type": {
        "type": "string",
        "enum": ["pet", "property", "vehicle", "person"],
        "description": "实体类型"
      },
      "name": {
        "type": "string",
        "description": "实体名称，如宠物的名字"
      },
      "attributes": {
        "type": "object",
        "description": "实体属性，如 {\"breed\": \"金毛\", \"age\": 3}"
      }
    },
    "required": ["entity_type"]
  }
}
```

#### update_entity
更新实体信息或状态。

```json
{
  "name": "update_entity",
  "description": "更新实体的属性或状态",
  "inputSchema": {
    "type": "object",
    "properties": {
      "entity_id": {
        "type": "integer",
        "description": "实体 ID"
      },
      "name": {
        "type": "string",
        "description": "新的名称（可选）"
      },
      "attributes": {
        "type": "object",
        "description": "要更新的属性（可选）"
      },
      "status": {
        "type": "string",
        "enum": ["active", "inactive"],
        "description": "实体状态（可选）"
      }
    },
    "required": ["entity_id"]
  }
}
```

#### list_entities
列出所有实体。

```json
{
  "name": "list_entities",
  "description": "列出用户的所有实体，可按类型和状态筛选",
  "inputSchema": {
    "type": "object",
    "properties": {
      "entity_type": {
        "type": "string",
        "description": "按类型筛选（可选）"
      },
      "status": {
        "type": "string",
        "enum": ["active", "inactive", "all"],
        "default": "active",
        "description": "按状态筛选"
      }
    }
  }
}
```

#### delete_entity
删除实体。

```json
{
  "name": "delete_entity",
  "description": "删除指定实体（软删除，状态改为 inactive）",
  "inputSchema": {
    "type": "object",
    "properties": {
      "entity_id": {
        "type": "integer",
        "description": "要删除的实体 ID"
      }
    },
    "required": ["entity_id"]
  }
}
```

---

### 3. 事件管理

#### add_event
记录新事件。

```json
{
  "name": "add_event",
  "description": "记录一个新事件，可以关联一个或多个实体",
  "inputSchema": {
    "type": "object",
    "properties": {
      "event_type": {
        "type": "string",
        "enum": ["purchase", "illness", "maintenance", "activity", "milestone", "other"],
        "description": "事件类型"
      },
      "description": {
        "type": "string",
        "description": "事件描述"
      },
      "related_entity_ids": {
        "type": "array",
        "items": {"type": "integer"},
        "description": "关联的实体 ID 列表（可选）"
      },
      "metadata": {
        "type": "object",
        "description": "额外信息，如 {\"cost\": 2000, \"location\": \"北京\"}（可选）"
      },
      "timestamp": {
        "type": "string",
        "format": "date-time",
        "description": "事件发生时间（ISO 8601 格式，可选，默认当前时间）"
      },
      "importance": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "default": 0.5,
        "description": "重要性评分"
      }
    },
    "required": ["event_type", "description"]
  }
}
```

#### search_events
搜索历史事件。

```json
{
  "name": "search_events",
  "description": "按时间、类型、关键词搜索历史事件",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "搜索关键词（可选）"
      },
      "event_type": {
        "type": "string",
        "description": "按事件类型筛选（可选）"
      },
      "time_range": {
        "type": "string",
        "description": "时间范围，如 'last_week', 'last_month', '2024-01'（可选）"
      },
      "limit": {
        "type": "integer",
        "default": 20,
        "description": "返回结果数量限制"
      }
    }
  }
}
```

#### query_entity_timeline
查询实体的事件时间线。

```json
{
  "name": "query_entity_timeline",
  "description": "查询某个实体相关的所有事件，按时间倒序排列",
  "inputSchema": {
    "type": "object",
    "properties": {
      "entity_id": {
        "type": "integer",
        "description": "实体 ID"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "description": "返回结果数量限制"
      }
    },
    "required": ["entity_id"]
  }
}
```

---

## 事件类型模板

为了帮助模型更好理解不同事件类型，提供预定义模板（通过 MCP Resources 返回）：

```json
{
  "event_templates": {
    "purchase": {
      "description": "购买或获得某物",
      "common_entities": ["property", "vehicle", "pet"],
      "metadata_fields": ["cost", "location", "brand", "model"]
    },
    "illness": {
      "description": "疾病或就医事件",
      "common_entities": ["pet", "person"],
      "metadata_fields": ["cost", "diagnosis", "hospital", "medication"]
    },
    "maintenance": {
      "description": "维护或保养",
      "common_entities": ["vehicle", "property"],
      "metadata_fields": ["cost", "service_type", "service_provider"]
    },
    "activity": {
      "description": "日常活动或互动",
      "common_entities": ["pet", "person"],
      "metadata_fields": ["location", "duration"]
    },
    "milestone": {
      "description": "重要里程碑",
      "common_entities": ["person", "pet", "property"],
      "metadata_fields": ["significance"]
    }
  }
}
```

---

## 实现细节

### 技术栈
- **语言**：Python 3.10+
- **数据库**：SQLite 3
- **MCP SDK**：`mcp` Python 包
- **JSON 处理**：标准库 `json`

### 项目结构

```
memory-mcp-server/
├── src/
│   ├── __init__.py
│   ├── server.py          # MCP Server 主逻辑
│   ├── database.py        # 数据库操作封装
│   ├── models.py          # 数据模型定义
│   └── utils.py           # 工具函数（时间解析、JSON 处理等）
├── tests/
│   ├── test_database.py
│   ├── test_tools.py
│   └── test_integration.py
├── config.json            # 配置文件（数据库路径、默认用户等）
├── requirements.txt
└── README.md
```

### 关键实现逻辑

#### 1. 数据库初始化
```python
# database.py
import sqlite3
import json
from pathlib import Path

class MemoryDatabase:
    def __init__(self, db_path: str, user_id: str = "default"):
        self.db_path = db_path
        self.user_id = user_id
        self.conn = None
        self._initialize()
    
    def _initialize(self):
        """初始化数据库连接和表结构"""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._create_tables()
    
    def _create_tables(self):
        """创建所有表"""
        cursor = self.conn.cursor()
        # 执行上面定义的所有 CREATE TABLE 语句
        # ...
```

#### 2. JSON 字段处理
SQLite 不原生支持 JSON，需要手动处理：

```python
def _serialize_json(data):
    """将 Python 对象序列化为 JSON 字符串"""
    return json.dumps(data) if data else None

def _deserialize_json(data):
    """将 JSON 字符串反序列化为 Python 对象"""
    return json.loads(data) if data else None
```

#### 3. 时间范围解析
```python
# utils.py
from datetime import datetime, timedelta

def parse_time_range(time_range: str):
    """
    解析时间范围字符串
    支持格式：
    - 'last_week', 'last_month', 'last_year'
    - '2024-01' (月份)
    - '2024' (年份)
    """
    now = datetime.now()
    
    if time_range == 'last_week':
        return now - timedelta(days=7), now
    elif time_range == 'last_month':
        return now - timedelta(days=30), now
    elif time_range == 'last_year':
        return now - timedelta(days=365), now
    elif len(time_range) == 7:  # YYYY-MM
        year, month = map(int, time_range.split('-'))
        start = datetime(year, month, 1)
        if month == 12:
            end = datetime(year + 1, 1, 1)
        else:
            end = datetime(year, month + 1, 1)
        return start, end
    elif len(time_range) == 4:  # YYYY
        year = int(time_range)
        return datetime(year, 1, 1), datetime(year + 1, 1, 1)
    else:
        raise ValueError(f"Unsupported time range format: {time_range}")
```

#### 4. 冲突处理
当更新 `user_profile` 时，检测是否存在冲突：

```python
def update_profile(self, key: str, value: str, category: str = None):
    """更新用户属性，返回是否有旧值被覆盖"""
    cursor = self.conn.cursor()
    
    # 检查是否存在旧值
    cursor.execute(
        "SELECT value FROM user_profile WHERE user_id = ? AND key = ?",
        (self.user_id, key)
    )
    old_row = cursor.fetchone()
    
    # 插入或更新
    cursor.execute("""
        INSERT INTO user_profile (user_id, key, value, category, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, key) DO UPDATE SET
            value = excluded.value,
            category = COALESCE(excluded.category, category),
            updated_at = CURRENT_TIMESTAMP
    """, (self.user_id, key, value, category))
    
    self.conn.commit()
    
    return {
        "updated": True,
        "had_previous_value": old_row is not None,
        "previous_value": old_row[0] if old_row else None
    }
```

#### 5. 实体关联事件查询
```python
def query_entity_timeline(self, entity_id: int, limit: int = 10):
    """查询实体的事件时间线"""
    cursor = self.conn.cursor()
    
    # SQLite 的 JSON 查询支持有限，使用 LIKE 简单匹配
    cursor.execute("""
        SELECT * FROM events
        WHERE user_id = ? 
        AND (related_entity_ids LIKE ? OR related_entity_ids LIKE ? OR related_entity_ids LIKE ?)
        ORDER BY timestamp DESC
        LIMIT ?
    """, (
        self.user_id,
        f'%[{entity_id},%',  # [123, ...
        f'%, {entity_id}]%',  # ..., 123]
        f'%[{entity_id}]%',   # [123]
        limit
    ))
    
    return [dict(row) for row in cursor.fetchall()]
```

---

## 使用示例

### 场景 1：基础信息管理
```
用户："我在北京的字节跳动上班"
模型调用：update_profile(key="workplace", value="字节跳动", category="basic_info")
模型调用：update_profile(key="work_location", value="北京", category="basic_info")
```

### 场景 2：宠物管理
```
用户："我养了只金毛叫旺财"
模型调用：create_entity(entity_type="pet", name="旺财", attributes={"breed": "金毛"})
→ 返回 entity_id = 5
模型调用：add_event(event_type="milestone", description="领养了金毛旺财", related_entity_ids=[5])

用户："旺财昨天生病了，花了 2000 块"
模型调用：list_entities(entity_type="pet") → 找到旺财 ID=5
模型调用：add_event(
    event_type="illness",
    description="旺财生病就医",
    related_entity_ids=[5],
    metadata={"cost": 2000},
    timestamp="2025-10-27T00:00:00Z"
)

用户："旺财最近怎么样？"
模型调用：query_entity_timeline(entity_id=5, limit=5)
模型回复："旺财昨天生病去看了医生，花费 2000 元。之前在上周领养的。"
```

### 场景 3：资产管理
```
用户："我在 2023 年买了一套房，花了 500 万"
模型调用：create_entity(entity_type="property", attributes={"type": "apartment"})
→ 返回 entity_id = 10
模型调用：add_event(
    event_type="purchase",
    description="购买房产",
    related_entity_ids=[10],
    metadata={"cost": 5000000},
    timestamp="2023-01-01T00:00:00Z"
)

用户："我的资产有哪些？"
模型调用：list_entities(entity_type="property")
模型调用：list_entities(entity_type="vehicle")
模型回复："你目前有 1 套房产（2023 年购入）。"
```

---

## 多用户支持

### 方案 1：单数据库多用户（推荐）
所有用户数据存储在同一个 SQLite 文件中，通过 `user_id` 字段隔离。

**优点**：
- 部署简单，只需一个数据库文件
- 便于数据备份和迁移

**实现**：
```python
# 在 MCP Server 启动时指定 user_id
server = MemoryMCPServer(db_path="memory.db", user_id="user_123")
```

### 方案 2：每用户独立数据库
每个用户使用独立的 SQLite 文件。

**优点**：
- 数据完全隔离
- 可以按用户单独备份

**实现**：
```python
# 根据 user_id 生成不同的数据库路径
db_path = f"data/{user_id}/memory.db"
server = MemoryMCPServer(db_path=db_path, user_id=user_id)
```

---

## 配置文件

```json
{
  "database": {
    "path": "./data/memory.db",
    "backup_interval": 3600
  },
  "server": {
    "name": "personal-memory-server",
    "version": "1.0.0",
    "default_user_id": "default"
  },
  "features": {
    "enable_entity_relations": true,
    "max_events_per_query": 100,
    "auto_backup": true
  }
}
```

---

## 测试用例

### 单元测试
```python
# tests/test_database.py
def test_update_profile():
    db = MemoryDatabase(":memory:")
    result = db.update_profile("workplace", "字节跳动", "basic_info")
    assert result["updated"] == True
    assert result["had_previous_value"] == False

def test_create_entity():
    db = MemoryDatabase(":memory:")
    entity_id = db.create_entity("pet", "旺财", {"breed": "金毛"})
    assert entity_id > 0
    
    entities = db.list_entities(entity_type="pet")
    assert len(entities) == 1
    assert entities[0]["name"] == "旺财"
```

### 集成测试
```python
# tests/test_integration.py
def test_pet_lifecycle():
    db = MemoryDatabase(":memory:")
    
    # 创建宠物
    pet_id = db.create_entity("pet", "旺财", {"breed": "金毛"})
    
    # 记录领养事件
    db.add_event("milestone", "领养旺财", related_entity_ids=[pet_id])
    
    # 记录生病事件
    db.add_event("illness", "旺财生病", related_entity_ids=[pet_id], metadata={"cost": 2000})
    
    # 查询时间线
    timeline = db.query_entity_timeline(pet_id)
    assert len(timeline) == 2
    assert timeline[0]["event_type"] == "illness"  # 最新的在前
```

---

## 部署说明

### 本地运行
```bash
# 安装依赖
pip install -r requirements.txt

# 启动 MCP Server（stdio 模式）
python -m src.server

# 或使用配置文件
python -m src.server --config config.json
```

### Claude Desktop 集成
在 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "personal-memory": {
      "command": "python",
      "args": ["-m", "src.server"],
      "cwd": "/path/to/memory-mcp-server",
      "env": {
        "USER_ID": "your_user_id"
      }
    }
  }
}
```

---

## 后续优化方向

### 第一阶段（MVP）
- ✅ 基础 CRUD 操作
- ✅ 实体-事件模型
- ✅ 多用户支持
- ✅ 时间范围查询

### 第二阶段（增强）
- [ ] 冲突检测和提示
- [ ] 自动实体识别（模型提到"我的狗"自动匹配 entity_id）
- [ ] 智能聚合查询（"我的所有资产"）
- [ ] 数据导入/导出功能

### 第三阶段（高级）
- [ ] 向量检索支持（sqlite-vec）
- [ ] 对话历史语义搜索
- [ ] 趋势分析（事件频率、周期性）
- [ ] Web 管理界面

---

## 常见问题

### Q: 为什么不用图数据库？
A: 个人记忆场景的关系复杂度不高，关系型数据库 + 实体-事件模型足够清晰且易于模型理解。图数据库会增加部署复杂度和模型理解难度。

### Q: 为什么不用向量数据库？
A: 现阶段主要是结构化信息（"在哪上班"），不需要语义检索。未来需要对话历史搜索时，可以用 sqlite-vec 扩展，无需引入外部依赖。

### Q: 如何处理数据冲突？
A: 通过时间戳和置信度字段。新信息覆盖旧信息，但保留历史记录在 `events` 表中。可以在 `update_profile` 时返回旧值提示用户。

### Q: 如何确保数据安全？
A: 
1. 本地存储，不上传云端
2. 数据库文件加密（可选，使用 SQLCipher）
3. 定期备份到用户指定位置
4. 多用户场景使用独立数据库文件

### Q: 模型理解不了怎么办？
A: 
1. 在 System Prompt 中提供详细的工具使用示例
2. 使用事件类型模板（通过 MCP Resources）
3. 对弱模型简化工具描述，减少可选参数
4. 提供常见场景的标准调用流程

---

## 附录：System Prompt 建议

```
你可以访问用户的个人记忆系统，用于存储和查询用户的个人信息。

## 使用规则

1. **用户属性**（user_profile）：存储简单的个人信息
   - 例如：工作地点、爱好、习惯
   - 使用 update_profile / query_profile

2. **实体**（entities）：有生命周期的"东西"
   - 例如：宠物、房产、车辆、重要的人
   - 使用 create_entity / list_entities

3. **事件**（events）：发生的事情
   - 例如：购买、生病、保养、活动
   - 使用 add_event / search_events
   - 可以关联一个或多个实体

## 常见场景示例

**用户说："我在北京的字节跳动上班"**
→ update_profile(key="workplace", value="字节跳动")
→ update_profile(key="work_location", value="北京")

**用户说："我养了只金毛叫旺财"**
→ create_entity(entity_type="pet", name="旺财", attributes={"breed": "金毛"})
→ add_event(event_type="milestone", description="领养旺财", related_entity_ids=[新建的ID])

**用户说："旺财昨天生病了"**
→ list_entities(entity_type="pet") 找到旺财的ID
→ add_event(event_type="illness", description="旺财生病就医", related_entity_ids=[旺财ID])

**用户问："我的狗最近怎么样？"**
→ list_entities(entity_type="pet") 找到狗的ID
→ query_entity_timeline(entity_id=狗ID) 获取最近事件
→ 根据事件总结回复用户

## 注意事项

- 主动记忆：当用户分享个人信息时，主动调用相应工具存储
- 避免重复：查询前先检查是否已有相关信息
- 时间敏感：记录事件时尽量包含准确的时间信息
- 实体关联：涉及宠物、资产等时，优先创建实体而非简单属性
```

---

## 完整代码框架

### requirements.txt
```
mcp>=0.9.0
```

### src/server.py
```python
#!/usr/bin/env python3
"""
Personal Memory MCP Server
基于 MCP 协议的个人记忆管理服务
"""

import asyncio
import json
from typing import Any, Optional
from mcp.server import Server
from mcp.types import (
    Tool,
    TextContent,
    Resource,
)
from mcp.server.stdio import stdio_server

from .database import MemoryDatabase
from .utils import parse_time_range

class MemoryMCPServer:
    def __init__(self, db_path: str, user_id: str = "default"):
        self.db = MemoryDatabase(db_path, user_id)
        self.server = Server("personal-memory-server")
        self._register_handlers()
    
    def _register_handlers(self):
        """注册 MCP 处理器"""
        
        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            """返回所有可用工具"""
            return [
                # 用户属性管理
                Tool(
                    name="update_profile",
                    description="更新或添加用户的基础信息，如工作地点、爱好、习惯等",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "key": {
                                "type": "string",
                                "description": "属性键名，如 'workplace', 'favorite_food'"
                            },
                            "value": {
                                "type": "string",
                                "description": "属性值"
                            },
                            "category": {
                                "type": "string",
                                "enum": ["basic_info", "preferences", "habits"],
                                "description": "属性分类"
                            }
                        },
                        "required": ["key", "value"]
                    }
                ),
                Tool(
                    name="query_profile",
                    description="查询用户的基础信息，支持按键名或分类筛选",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "keys": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "要查询的键名列表（可选）"
                            },
                            "category": {
                                "type": "string",
                                "description": "按分类查询（可选）"
                            }
                        }
                    }
                ),
                Tool(
                    name="delete_profile",
                    description="删除指定的用户属性",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "key": {
                                "type": "string",
                                "description": "要删除的属性键名"
                            }
                        },
                        "required": ["key"]
                    }
                ),
                
                # 实体管理
                Tool(
                    name="create_entity",
                    description="创建新的实体，如宠物、房产、车辆、重要的人",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "entity_type": {
                                "type": "string",
                                "enum": ["pet", "property", "vehicle", "person"],
                                "description": "实体类型"
                            },
                            "name": {
                                "type": "string",
                                "description": "实体名称，如宠物的名字"
                            },
                            "attributes": {
                                "type": "object",
                                "description": "实体属性，如 {\"breed\": \"金毛\", \"age\": 3}"
                            }
                        },
                        "required": ["entity_type"]
                    }
                ),
                Tool(
                    name="update_entity",
                    description="更新实体的属性或状态",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "entity_id": {
                                "type": "integer",
                                "description": "实体 ID"
                            },
                            "name": {
                                "type": "string",
                                "description": "新的名称（可选）"
                            },
                            "attributes": {
                                "type": "object",
                                "description": "要更新的属性（可选）"
                            },
                            "status": {
                                "type": "string",
                                "enum": ["active", "inactive"],
                                "description": "实体状态（可选）"
                            }
                        },
                        "required": ["entity_id"]
                    }
                ),
                Tool(
                    name="list_entities",
                    description="列出用户的所有实体，可按类型和状态筛选",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "entity_type": {
                                "type": "string",
                                "description": "按类型筛选（可选）"
                            },
                            "status": {
                                "type": "string",
                                "enum": ["active", "inactive", "all"],
                                "default": "active",
                                "description": "按状态筛选"
                            }
                        }
                    }
                ),
                Tool(
                    name="delete_entity",
                    description="删除指定实体（软删除，状态改为 inactive）",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "entity_id": {
                                "type": "integer",
                                "description": "要删除的实体 ID"
                            }
                        },
                        "required": ["entity_id"]
                    }
                ),
                
                # 事件管理
                Tool(
                    name="add_event",
                    description="记录一个新事件，可以关联一个或多个实体",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "event_type": {
                                "type": "string",
                                "enum": ["purchase", "illness", "maintenance", "activity", "milestone", "other"],
                                "description": "事件类型"
                            },
                            "description": {
                                "type": "string",
                                "description": "事件描述"
                            },
                            "related_entity_ids": {
                                "type": "array",
                                "items": {"type": "integer"},
                                "description": "关联的实体 ID 列表（可选）"
                            },
                            "metadata": {
                                "type": "object",
                                "description": "额外信息，如 {\"cost\": 2000, \"location\": \"北京\"}（可选）"
                            },
                            "timestamp": {
                                "type": "string",
                                "format": "date-time",
                                "description": "事件发生时间（ISO 8601 格式，可选，默认当前时间）"
                            },
                            "importance": {
                                "type": "number",
                                "minimum": 0,
                                "maximum": 1,
                                "default": 0.5,
                                "description": "重要性评分"
                            }
                        },
                        "required": ["event_type", "description"]
                    }
                ),
                Tool(
                    name="search_events",
                    description="按时间、类型、关键词搜索历史事件",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "搜索关键词（可选）"
                            },
                            "event_type": {
                                "type": "string",
                                "description": "按事件类型筛选（可选）"
                            },
                            "time_range": {
                                "type": "string",
                                "description": "时间范围，如 'last_week', 'last_month', '2024-01'（可选）"
                            },
                            "limit": {
                                "type": "integer",
                                "default": 20,
                                "description": "返回结果数量限制"
                            }
                        }
                    }
                ),
                Tool(
                    name="query_entity_timeline",
                    description="查询某个实体相关的所有事件，按时间倒序排列",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "entity_id": {
                                "type": "integer",
                                "description": "实体 ID"
                            },
                            "limit": {
                                "type": "integer",
                                "default": 10,
                                "description": "返回结果数量限制"
                            }
                        },
                        "required": ["entity_id"]
                    }
                ),
            ]
        
        @self.server.list_resources()
        async def list_resources() -> list[Resource]:
            """返回事件类型模板等资源"""
            return [
                Resource(
                    uri="memory://event-templates",
                    name="Event Type Templates",
                    description="预定义的事件类型模板，帮助理解不同事件的使用场景",
                    mimeType="application/json"
                )
            ]
        
        @self.server.read_resource()
        async def read_resource(uri: str) -> str:
            """读取资源内容"""
            if uri == "memory://event-templates":
                templates = {
                    "event_templates": {
                        "purchase": {
                            "description": "购买或获得某物",
                            "common_entities": ["property", "vehicle", "pet"],
                            "metadata_fields": ["cost", "location", "brand", "model"]
                        },
                        "illness": {
                            "description": "疾病或就医事件",
                            "common_entities": ["pet", "person"],
                            "metadata_fields": ["cost", "diagnosis", "hospital", "medication"]
                        },
                        "maintenance": {
                            "description": "维护或保养",
                            "common_entities": ["vehicle", "property"],
                            "metadata_fields": ["cost", "service_type", "service_provider"]
                        },
                        "activity": {
                            "description": "日常活动或互动",
                            "common_entities": ["pet", "person"],
                            "metadata_fields": ["location", "duration"]
                        },
                        "milestone": {
                            "description": "重要里程碑",
                            "common_entities": ["person", "pet", "property"],
                            "metadata_fields": ["significance"]
                        }
                    }
                }
                return json.dumps(templates, ensure_ascii=False, indent=2)
            
            raise ValueError(f"Unknown resource: {uri}")
        
        @self.server.call_tool()
        async def call_tool(name: str, arguments: Any) -> list[TextContent]:
            """处理工具调用"""
            try:
                result = None
                
                # 用户属性管理
                if name == "update_profile":
                    result = self.db.update_profile(
                        arguments["key"],
                        arguments["value"],
                        arguments.get("category")
                    )
                elif name == "query_profile":
                    result = self.db.query_profile(
                        arguments.get("keys"),
                        arguments.get("category")
                    )
                elif name == "delete_profile":
                    result = self.db.delete_profile(arguments["key"])
                
                # 实体管理
                elif name == "create_entity":
                    entity_id = self.db.create_entity(
                        arguments["entity_type"],
                        arguments.get("name"),
                        arguments.get("attributes")
                    )
                    result = {"entity_id": entity_id}
                elif name == "update_entity":
                    result = self.db.update_entity(
                        arguments["entity_id"],
                        arguments.get("name"),
                        arguments.get("attributes"),
                        arguments.get("status")
                    )
                elif name == "list_entities":
                    result = self.db.list_entities(
                        arguments.get("entity_type"),
                        arguments.get("status", "active")
                    )
                elif name == "delete_entity":
                    result = self.db.delete_entity(arguments["entity_id"])
                
                # 事件管理
                elif name == "add_event":
                    event_id = self.db.add_event(
                        arguments["event_type"],
                        arguments["description"],
                        arguments.get("related_entity_ids"),
                        arguments.get("metadata"),
                        arguments.get("timestamp"),
                        arguments.get("importance", 0.5)
                    )
                    result = {"event_id": event_id}
                elif name == "search_events":
                    result = self.db.search_events(
                        arguments.get("query"),
                        arguments.get("event_type"),
                        arguments.get("time_range"),
                        arguments.get("limit", 20)
                    )
                elif name == "query_entity_timeline":
                    result = self.db.query_entity_timeline(
                        arguments["entity_id"],
                        arguments.get("limit", 10)
                    )
                
                else:
                    raise ValueError(f"Unknown tool: {name}")
                
                return [TextContent(
                    type="text",
                    text=json.dumps(result, ensure_ascii=False, indent=2)
                )]
            
            except Exception as e:
                return [TextContent(
                    type="text",
                    text=json.dumps({"error": str(e)}, ensure_ascii=False)
                )]
    
    async def run(self):
        """启动服务器"""
        async with stdio_server() as (read_stream, write_stream):
            await self.server.run(
                read_stream,
                write_stream,
                self.server.create_initialization_options()
            )


async def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Personal Memory MCP Server")
    parser.add_argument("--db-path", default="./data/memory.db", help="数据库文件路径")
    parser.add_argument("--user-id", default="default", help="用户 ID")
    args = parser.parse_args()
    
    server = MemoryMCPServer(args.db_path, args.user_id)
    await server.run()


if __name__ == "__main__":
    asyncio.run(main())
```

---

## 总结

这份设计文档包含：

1. **清晰的数据模型**：实体-事件-属性三层结构
2. **完整的 MCP Tools 定义**：10 个工具覆盖所有 CRUD 操作
3. **详细的实现细节**：数据库 Schema、关键代码逻辑
4. **实用的使用示例**：从简单到复杂的场景演示
5. **可扩展的架构**：支持未来添加向量检索、趋势分析等功能

**核心优势**：
- ✅ 模型友好：清晰的操作语义，主流模型都能理解
- ✅ 零依赖：只需 Python + SQLite
- ✅ 易维护：关系型数据库，SQL 查询简单直观
- ✅ 可扩展：预留了向量检索、关系推理等扩展接口

直接把这份文档丢给任何一个懂 Python 的 AI，它就能开始写代