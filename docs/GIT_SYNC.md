# SQLite 数据库远程同步方案

## 概述

本文档描述如何通过 Git 私有仓库实现 Mnemosyne 数据库的跨设备同步。这是一个额外的可选功能，允许你在多台设备之间同步个人记忆数据。

## 快速开始

### 完整工作流程

```bash
# 1️⃣  初始化 Git 同步环境（仅首次）
npm run sync:init

# 2️⃣  绑定远程仓库
npm run sync:remote https://github.com/username/mnemosyne-data.git

# 3️⃣  首次推送数据到远程
npm run sync:push

# 4️⃣  日常使用 - 自动双向同步
npm run sync
```

### 在其他设备上设置

```bash
# 1️⃣  安装并运行 Mnemosyne（会创建 ~/.mnemosyne 目录）
npm start

# 2️⃣  克隆远程数据（会覆盖本地数据库）
cd ~/.mnemosyne
git init
git remote add origin https://github.com/username/mnemosyne-data.git
git pull origin main

# 3️⃣  添加安全目录（Windows 可能需要）
git config --global --add safe.directory ~/.mnemosyne

# 4️⃣  日常同步
npm run sync
```

## 可用命令

### 初始化命令

```bash
# 初始化完整的 Git 环境（创建仓库、.gitignore、初始提交）
npm run sync:init

# 设置或更新远程仓库地址
npm run sync:remote <远程仓库URL>

# 示例
npm run sync:remote https://github.com/username/mnemosyne-data.git
npm run sync:remote git@github.com:username/mnemosyne-data.git
```

### 同步命令

```bash
# 双向同步（推荐）- 先拉取，再推送
npm run sync

# 仅推送本地更改到远程
npm run sync:push

# 仅从远程拉取更新
npm run sync:pull

# 查看同步状态
npm run sync:status
```

### 高级选项

```bash
# 强制同步（覆盖本地更改，谨慎使用！）
npm run sync -- --force

# 查看帮助信息
node scripts/sync_db.js --help
```

## 方案设计

### 架构

```
设备 A                     Git 私有仓库                设备 B
  │                            │                         │
  ├─> 1. 提交数据库文件 ────────┤                         │
  │                            ├─> 2. 拉取更新 <──────────┤
  │                            │                         │
  └─> 3. 拉取更新 <────────────┤                         │
                               └─> 4. 提交新数据 <────────┘
```

### 工作流程

1. **初始化**: 将数据库文件添加到 Git 仓库
2. **定期同步**: 自动或手动提交和拉取更新
3. **冲突处理**: 使用时间戳或合并策略解决冲突

## 详细步骤

### 1. 创建 Git 私有仓库

在 GitHub/GitLab/Gitea 等平台创建一个私有仓库：

```bash
# 示例：在 GitHub 上
# 1. 访问 https://github.com/new
# 2. 创建私有仓库：mnemosyne-data
# 3. 不要初始化 README 或 .gitignore（让我们的脚本来创建）
```

### 2. 初始化本地环境

**使用自动化脚本（推荐）：**

```bash
# 一键初始化
npm run sync:init
```

这个命令会自动完成：
- ✅ 初始化 Git 仓库
- ✅ 创建 .gitignore 文件
- ✅ 创建初始提交
- ✅ 设置默认分支为 main
- ✅ 配置 Git 用户信息

**手动初始化（可选）：**

```bash
.DS_Store
Thumbs.db
EOF

# 添加数据库文件
git add memory.db .gitignore
git commit -m "Initial commit: memory database"

# 关联远程仓库
git remote add origin https://github.com/your-username/mnemosyne-data.git

# 推送到远程
git push -u origin main
```

### 3. 创建同步脚本

创建 `sync_db.js` 脚本用于自动同步：

```javascript
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DATA_DIR = join(homedir(), '.mnemosyne');
const DB_FILE = 'memory.db';

/**
 * 执行 Git 命令
 */
function gitCommand(cmd) {
  try {
    return execSync(cmd, { 
      cwd: DATA_DIR, 
      encoding: 'utf-8',
      stdio: 'pipe'
    });
  } catch (error) {
    console.error(`Git 命令失败: ${cmd}`);
    throw error;
  }
}

/**
 * 检查是否有未提交的更改
 */
function hasChanges() {
  const status = gitCommand('git status --porcelain');
  return status.trim().length > 0;
}

/**
 * 同步数据库
 */
async function syncDatabase() {
  console.log('🔄 开始同步数据库...');

  // 检查 Git 仓库是否存在
  if (!existsSync(join(DATA_DIR, '.git'))) {
    console.error('❌ Git 仓库未初始化，请先运行初始化命令');
    return false;
  }

  try {
    // 1. 拉取远程更新
    console.log('📥 拉取远程更新...');
    gitCommand('git pull --rebase origin main');

    // 2. 检查本地是否有更改
    if (hasChanges()) {
      console.log('📤 提交本地更改...');
      gitCommand(`git add ${DB_FILE}`);
      const timestamp = new Date().toISOString();
      gitCommand(`git commit -m "Auto sync: ${timestamp}"`);

      // 3. 推送到远程
      console.log('⬆️  推送到远程仓库...');
      gitCommand('git push origin main');
    } else {
      console.log('✅ 数据库已是最新，无需同步');
    }

    console.log('🎉 同步完成！');
    return true;
  } catch (error) {
    console.error('❌ 同步失败:', error.message);
    
    // 如果有冲突，提供手动解决指引
    if (error.message.includes('conflict')) {
      console.log('\n⚠️  检测到冲突，请手动解决：');
      console.log('1. cd ~/.mnemosyne');
      console.log('2. git status  # 查看冲突文件');
      console.log('3. 手动编辑或选择保留哪个版本');
      console.log('4. git add memory.db');
      console.log('5. git rebase --continue');
      console.log('6. git push origin main');
    }
    
    return false;
  }
}

// 执行同步
syncDatabase();
```

### 4. 在新设备上克隆数据

```bash
# 在新设备上
cd ~
git clone https://github.com/your-username/mnemosyne-data.git .mnemosyne

# 现在 ~/.mnemosyne/memory.db 已经同步
```

### 5. 添加定时同步（可选）

#### Windows (使用任务计划程序)

```powershell
# 创建每小时同步的任务
$action = New-ScheduledTaskAction -Execute "node" -Argument "sync_db.js" -WorkingDirectory "$env:USERPROFILE\.mnemosyne"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName "MnemosyneSync" -Action $action -Trigger $trigger
```

#### macOS/Linux (使用 cron)

```bash
# 编辑 crontab
crontab -e

# 添加每小时同步
0 * * * * cd ~/.mnemosyne && node sync_db.js >> sync.log 2>&1
```

## 冲突处理策略

### 策略 1: 最新优先（推荐）

```bash
# 拉取时总是使用远程版本
git pull -X theirs origin main
```

### 策略 2: 本地优先

```bash
# 拉取时总是使用本地版本
git pull -X ours origin main
```

### 策略 3: 手动合并

对于重要数据，建议手动检查和合并：

```bash
# 1. 拉取但不合并
git fetch origin main

# 2. 查看差异
git diff main origin/main

# 3. 手动决定如何处理
# 可以导出两个版本的数据库，使用 SQLite 工具合并
```

## 安全建议

### 1. 使用私有仓库

- ✅ 在 GitHub/GitLab 上使用私有仓库
- ✅ 或使用自托管的 Git 服务器（如 Gitea）

### 2. 数据库加密（高级）

如果需要额外的安全层，可以使用 SQLCipher：

```bash
npm install better-sqlite3-sqlcipher
```

修改 `database.js` 使用加密：

```javascript
import Database from 'better-sqlite3-sqlcipher';

// 在初始化时设置密钥
this.db = new Database(this.dbPath);
this.db.pragma(`key='your-encryption-key'`);
```

### 3. SSH 密钥认证

使用 SSH 密钥而非 HTTPS 密码：

```bash
# 生成 SSH 密钥
ssh-keygen -t ed25519 -C "your_email@example.com"

# 添加到 GitHub
# 将 ~/.ssh/id_ed25519.pub 内容复制到 GitHub Settings > SSH Keys

# 修改远程 URL
cd ~/.mnemosyne
git remote set-url origin git@github.com:your-username/mnemosyne-data.git
```

## MCP 工具集成（未来增强）

可以添加新的 MCP 工具来控制同步：

```javascript
// 在 index.js 中添加
{
  name: 'sync_database',
  description: '同步数据库到远程 Git 仓库',
  inputSchema: {
    type: 'object',
    properties: {
      direction: {
        type: 'string',
        enum: ['pull', 'push', 'both'],
        default: 'both',
        description: '同步方向'
      }
    }
  }
}
```

## 故障排查

### 问题 1: 推送失败（认证错误）

```bash
# 解决方案：使用 GitHub Personal Access Token
git remote set-url origin https://your-token@github.com/username/repo.git
```

### 问题 2: 合并冲突

```bash
# 查看冲突
git status

# 选择保留远程版本
git checkout --theirs memory.db
git add memory.db
git rebase --continue

# 或选择保留本地版本
git checkout --ours memory.db
git add memory.db
git rebase --continue
```

### 问题 3: 数据库文件太大

```bash
# 如果数据库超过 100MB，考虑使用 Git LFS
git lfs install
git lfs track "*.db"
git add .gitattributes
git commit -m "Add Git LFS support"
```

## 替代方案

### 1. 云同步服务

使用 Dropbox/iCloud/OneDrive 等云存储：

```javascript
// 修改默认数据库路径
const dbPath = join(process.env.DROPBOX_PATH, 'Mnemosyne', 'memory.db');
```

### 2. 自建同步服务

使用 rsync 或自定义 HTTP API：

```bash
# 定时同步到远程服务器
rsync -avz ~/.mnemosyne/memory.db user@server:/backup/mnemosyne/
```

### 3. 数据库复制

使用 SQLite 的在线备份功能：

```javascript
import Database from 'better-sqlite3';

function backupDatabase(source, dest) {
  const sourceDb = new Database(source, { readonly: true });
  const destDb = new Database(dest);
  sourceDb.backup(destDb);
  sourceDb.close();
  destDb.close();
}
```

## 总结

✅ **优点**：
- 版本控制，可以回溯历史
- 支持多设备同步
- 私有仓库保证数据安全
- 免费（使用 GitHub 私有仓库）

⚠️ **注意事项**：
- 需要处理潜在的合并冲突
- 大文件可能需要 Git LFS
- 需要定期执行同步（手动或自动化）

🔮 **未来增强**：
- 实现自动冲突解决算法
- 添加 MCP 工具控制同步
- 支持增量同步减少流量
- 实现端到端加密
