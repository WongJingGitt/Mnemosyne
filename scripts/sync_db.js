#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir, hostname } from 'os';
import initSqlJs from 'sql.js';

const DATA_DIR = join(homedir(), '.mnemosyne');
const DB_FILE = 'memory.db';
const DB_PATH = join(DATA_DIR, DB_FILE);

/**
 * 执行 SQLite checkpoint（将 WAL 文件的内容合并到主数据库）
 * 使用 sql.js 实现
 */
async function checkpointDatabase() {
  if (!existsSync(DB_PATH)) {
    return; // 数据库文件不存在，跳过
  }
  
  try {
    // 初始化 sql.js
    const SQL = await initSqlJs();
    
    // 加载数据库
    const buffer = readFileSync(DB_PATH);
    const db = new SQL.Database(buffer);
    
    // 执行 WAL checkpoint
    db.run('PRAGMA wal_checkpoint(TRUNCATE)');
    
    // 保存数据库（这会确保所有更改都写入主文件）
    const data = db.export();
    const newBuffer = Buffer.from(data);
    writeFileSync(DB_PATH, newBuffer);
    
    db.close();
    console.log('   ✓ 数据库 WAL checkpoint 完成');
  } catch (error) {
    console.log(`   ⚠️  WAL checkpoint 失败: ${error.message}`);
  }
}

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
    // 保留完整的错误输出
    const stderr = error.stderr ? error.stderr.trim() : '';
    const stdout = error.stdout ? error.stdout.trim() : '';
    const message = stderr || stdout || error.message;
    
    const err = new Error(`Git 命令失败 [${cmd}]: ${message}`);
    err.stderr = stderr;
    err.stdout = stdout;
    throw err;
  }
}



/**
 * 检查 Git 仓库是否已初始化
 */
function isGitRepo() {
  return existsSync(join(DATA_DIR, '.git'));
}

/**
 * 初始化完整的 Git 环境
 */
function initRepo() {
  console.log('🚀 初始化 Mnemosyne Git 同步环境...\n');
  
  try {
    // 1. 初始化 Git
    console.log('📦 步骤 1/4: 初始化 Git 仓库...');
    gitCommand('git init');
    
    // 配置本地 Git 用户信息（如果全局没有配置）
    try {
      gitCommand('git config user.name "Mnemosyne"');
      gitCommand('git config user.email "mnemosyne@local"');
    } catch (e) {
      // 忽略错误
    }
    
    console.log('   ✓ Git 仓库已创建');
    
    // 2. 创建 .gitignore
    console.log('\n📝 步骤 2/4: 配置 .gitignore...');
    const gitignoreContent = `# SQLite 临时文件
*.db-shm
*.db-wal

# 系统文件
.DS_Store
Thumbs.db

# 日志文件
*.log

# 备份文件
*.bak
*~
`;
    const gitignorePath = join(DATA_DIR, '.gitignore');
    writeFileSync(gitignorePath, gitignoreContent);
    console.log('   ✓ .gitignore 已创建');
    
    // 3. 创建初始提交
    console.log('\n💾 步骤 3/4: 创建初始提交...');
    gitCommand('git add .');
    
    // 如果数据库文件存在，确保它被包含
    const dbPath = join(DATA_DIR, DB_FILE);
    if (existsSync(dbPath)) {
      gitCommand(`git add ${DB_FILE}`);
      console.log(`   ✓ 数据库文件已添加: ${DB_FILE}`);
    }
    
    gitCommand('git commit -m "Initial commit: Mnemosyne memory database"');
    
    // 设置默认分支名称为 main
    try {
      gitCommand('git branch -M main');
      console.log('   ✓ 默认分支设置为 main');
    } catch (error) {
      console.log('   ℹ️  分支已是 main');
    }
    
    // 4. 提示下一步操作
    console.log('\n📋 步骤 4/4: 环境初始化完成！');
    console.log('\n✅ Git 同步环境已准备就绪！\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📌 下一步操作：绑定远程仓库\n');
    console.log('方式一：使用命令行');
    console.log('  npm run sync:remote <远程仓库URL>\n');
    console.log('方式二：手动绑定');
    console.log(`  cd ${DATA_DIR}`);
    console.log('  git remote add origin <远程仓库URL>\n');
    console.log('示例远程仓库 URL：');
    console.log('  https://github.com/username/mnemosyne-data.git');
    console.log('  git@github.com:username/mnemosyne-data.git\n');
    console.log('绑定后即可使用：');
    console.log('  npm run sync:push  # 推送到远程');
    console.log('  npm run sync:pull  # 从远程拉取');
    console.log('  npm run sync       # 双向同步');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    return true;
  } catch (error) {
    console.error('\n❌ 初始化失败:', error.message);
    
    // 如果是权限问题，提供解决方案
    if (error.message.includes('dubious ownership')) {
      console.log('\n💡 解决方案：请在命令行执行以下命令：');
      console.log(`   git config --global --add safe.directory "${DATA_DIR}"`);
      console.log('\n   然后重新运行: npm run sync:init\n');
    }
    
    return false;
  }
}

/**
 * 设置远程仓库
 */
function setRemote(remoteUrl) {
  console.log('🔗 设置远程仓库...\n');
  
  if (!isGitRepo()) {
    console.error('❌ Git 仓库未初始化');
    console.log('请先运行: npm run sync:init');
    return false;
  }
  
  try {
    // 检查是否已有 origin
    try {
      const existingRemote = gitCommand('git remote get-url origin').trim();
      console.log(`ℹ️  检测到已有远程仓库: ${existingRemote}`);
      console.log('正在更新为新地址...\n');
      gitCommand(`git remote set-url origin ${remoteUrl}`);
    } catch {
      // 没有 origin，添加新的
      gitCommand(`git remote add origin ${remoteUrl}`);
    }
    
    console.log('✅ 远程仓库已设置:', remoteUrl);
    console.log('\n现在可以使用以下命令进行同步：');
    console.log('  npm run sync:push  # 推送到远程');
    console.log('  npm run sync:pull  # 从远程拉取');
    console.log('  npm run sync       # 双向同步\n');
    
    return true;
  } catch (error) {
    console.error('❌ 设置远程仓库失败:', error.message);
    return false;
  }
}

/**
 * 获取当前分支名
 */
function getCurrentBranch() {
  try {
    return gitCommand('git branch --show-current').trim() || 'main';
  } catch {
    return 'main';
  }
}

/**
 * 同步数据库
 */
async function syncDatabase(options = {}) {
  const { direction = 'both', force = false } = options;
  
  console.log('🔄 开始同步数据库...\n');

  // 检查 Git 仓库是否存在
  if (!isGitRepo()) {
    console.error('❌ Git 仓库未初始化');
    console.log('提示：运行 npm run sync:init 来初始化\n');
    return false;
  }

  // 获取当前分支
  const branch = getCurrentBranch();

  try {
    // 拉取远程更新
    if (direction === 'pull' || direction === 'both') {
      console.log('📥 拉取远程更新...');
      try {
        if (force) {
          gitCommand('git fetch origin');
          gitCommand(`git reset --hard origin/${branch}`);
          console.log('✅ 强制同步：本地更改已被覆盖');
        } else {
          gitCommand(`git pull --rebase origin ${branch}`);
          console.log('✅ 远程更新已拉取');
        }
      } catch (error) {
        if (error.message.includes("couldn't find remote ref") || 
            error.message.includes("does not have any commits")) {
          console.log('ℹ️  远程仓库为空，跳过拉取');
        } else if (error.message.includes("Already up to date") || 
                   error.message.includes("already up-to-date")) {
          console.log('ℹ️  已是最新版本');
        } else {
          throw error;
        }
      }
    }

    // 推送本地更改
    if (direction === 'push' || direction === 'both') {
      console.log('\n📤 提交并推送本地更改...');
      
      // 执行 WAL checkpoint，确保所有更改都写入主数据库文件
      await checkpointDatabase();
      
      try {
        // 添加数据库文件（使用 -f 强制添加，即使之前未跟踪）
        try {
          gitCommand(`git add -f ${DB_FILE}`);
        } catch (addError) {
          // 如果添加失败，尝试不带 -f
          gitCommand(`git add ${DB_FILE}`);
        }
        
        // 尝试提交（如果有更改）
        const now = new Date();
        const dateStr = now.toLocaleString().replace(/\//g, '-');
        
        try {
          gitCommand(`git commit -m "Update: ${dateStr}"`);
          console.log('   ✓ 更改已提交');
        } catch (commitError) {
          // 检查是否是"无更改"的错误
          // Git 的 "nothing to commit" 或 "nothing added to commit" 信息会在错误消息中
          const errorMessage = String(commitError.message || '');
          
          if (errorMessage.includes('nothing to commit') || 
              errorMessage.includes('nothing added to commit')) {
            console.log('   ℹ️  无新更改需要提交');
          } else {
            throw commitError;
          }
        }
        
        // 尝试推送（无论是否有新提交）
        try {
          gitCommand(`git push origin ${branch}`);
          console.log('✅ 推送成功');
        } catch (pushError) {
          // 如果是第一次推送
          if (pushError.message.includes('no upstream branch')) {
            gitCommand(`git push -u origin ${branch}`);
            console.log('✅ 首次推送完成');
          } else if (pushError.message.includes('Everything up-to-date') || 
                     pushError.message.includes('up to date')) {
            console.log('ℹ️  远程已是最新');
          } else {
            throw pushError;
          }
        }
      } catch (error) {
        throw error;
      }
    }

    console.log('\n🎉 同步完成！');
    return true;
    
  } catch (error) {
    console.error('\n❌ 同步失败:', error.message);
    
    // 如果有冲突，提供手动解决指引
    if (error.message.includes('conflict') || error.message.includes('CONFLICT')) {
      console.log('\n⚠️  检测到冲突，请手动解决：');
      console.log(`1. cd ${DATA_DIR}`);
      console.log('2. git status  # 查看冲突文件');
      console.log('3. 解决冲突后执行：');
      console.log('   git add memory.db');
      console.log('   git rebase --continue');
      console.log('   git push origin main');
      console.log('\n或者使用强制同步（会覆盖本地更改）：');
      console.log('   npm run sync -- --force\n');
    }
    
    return false;
  }
}

/**
 * 显示状态
 */
function showStatus() {
  if (!isGitRepo()) {
    console.log('❌ Git 仓库未初始化');
    return;
  }

  console.log('📊 数据库同步状态\n');
  
  try {
    const branch = gitCommand('git branch --show-current').trim();
    console.log('分支:', branch || '(无)');
    
    const remote = gitCommand('git remote -v').trim();
    if (remote) {
      console.log('\n远程仓库:');
      console.log(remote);
    } else {
      console.log('远程仓库: 未配置');
    }
    
    const status = gitCommand('git status --short').trim();
    if (status) {
      console.log('\n未提交的更改:');
      console.log(status);
    } else {
      console.log('\n工作目录干净，无未提交更改');
    }
    
    const lastCommit = gitCommand('git log -1 --oneline').trim();
    if (lastCommit) {
      console.log('\n最后一次提交:');
      console.log(lastCommit);
    }
  } catch (error) {
    console.error('获取状态失败:', error.message);
  }
}

// 命令行参数解析
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    init: false,
    setRemote: false,
    remote: null,
    direction: 'both',
    force: false,
    status: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--init') {
      options.init = true;
    } else if (arg === '--set-remote' || arg === '--remote') {
      options.setRemote = true;
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        options.remote = args[++i];
      }
    } else if (arg === '--pull') {
      options.direction = 'pull';
    } else if (arg === '--push') {
      options.direction = 'push';
    } else if (arg === '--force' || arg === '-f') {
      options.force = true;
    } else if (arg === '--status' || arg === '-s') {
      options.status = true;
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    } else if (!arg.startsWith('--') && !options.remote) {
      // 如果是 URL（不以 -- 开头），当作远程地址
      options.remote = arg;
      options.setRemote = true;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Mnemosyne 数据库同步工具

用法:
  npm run sync [选项]

常用命令:
  npm run sync:init               初始化完整的 Git 同步环境
  npm run sync:remote <URL>       绑定远程仓库
  npm run sync:push               推送本地更改到远程
  npm run sync:pull               从远程拉取更新
  npm run sync                    双向同步（推荐）
  npm run sync:status             查看同步状态

选项:
  --init                          初始化 Git 环境（完整设置）
  --set-remote, --remote <URL>    设置/更新远程仓库地址
  --pull                          仅拉取远程更新
  --push                          仅推送本地更改
  --force, -f                     强制同步（覆盖本地更改）
  --status, -s                    显示同步状态
  --help, -h                      显示此帮助信息

完整工作流程:

  1️⃣  初始化环境
     npm run sync:init
     
  2️⃣  绑定远程仓库
     npm run sync:remote https://github.com/user/mnemosyne-data.git
     
  3️⃣  日常使用
     npm run sync        # 自动双向同步
     npm run sync:push   # 仅推送
     npm run sync:pull   # 仅拉取

示例:
  # 完整的首次设置
  npm run sync:init
  npm run sync:remote https://github.com/username/mnemosyne-data.git
  npm run sync:push

  # 日常同步
  npm run sync

  # 查看状态
  npm run sync:status

  # 强制同步（谨慎使用）
  npm run sync -- --force
`);
}

// 主函数
async function main() {
  const options = parseArgs();

  // 确保数据目录存在
  if (!existsSync(DATA_DIR)) {
    console.error(`❌ 数据目录不存在: ${DATA_DIR}`);
    console.log('请先运行 Mnemosyne 服务器以创建数据目录');
    process.exit(1);
  }

  // 处理不同的命令
  if (options.status) {
    // 查看状态
    showStatus();
  } else if (options.init) {
    // 初始化环境
    const success = initRepo();
    process.exit(success ? 0 : 1);
  } else if (options.setRemote) {
    // 设置远程仓库
    if (!options.remote) {
      console.error('❌ 需要指定远程仓库 URL');
      console.log('\n用法: npm run sync:remote <URL>');
      console.log('示例: npm run sync:remote https://github.com/user/mnemosyne-data.git\n');
      process.exit(1);
    }
    const success = setRemote(options.remote);
    process.exit(success ? 0 : 1);
  } else {
    // 同步数据库
    const success = await syncDatabase(options);
    process.exit(success ? 0 : 1);
  }
}

main().catch(error => {
  console.error('致命错误:', error);
  process.exit(1);
});
