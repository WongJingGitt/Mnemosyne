#!/usr/bin/env node

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
    throw new Error(`Git 命令失败 [${cmd}]: ${error.message}`);
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
 * 检查 Git 仓库是否已初始化
 */
function isGitRepo() {
  return existsSync(join(DATA_DIR, '.git'));
}

/**
 * 初始化 Git 仓库
 */
function initRepo(remoteUrl) {
  console.log('🚀 初始化 Git 仓库...');
  
  try {
    // 初始化 Git
    gitCommand('git init');
    
    // 创建 .gitignore
    const gitignoreContent = `*.db-shm
*.db-wal
.DS_Store
Thumbs.db
*.log
`;
    const gitignorePath = join(DATA_DIR, '.gitignore');
    require('fs').writeFileSync(gitignorePath, gitignoreContent);
    
    // 添加文件
    gitCommand('git add .');
    gitCommand('git commit -m "Initial commit: Mnemosyne memory database"');
    
    // 设置远程仓库
    if (remoteUrl) {
      gitCommand(`git remote add origin ${remoteUrl}`);
      console.log('✅ 远程仓库已设置:', remoteUrl);
    }
    
    console.log('✅ Git 仓库初始化完成！');
    return true;
  } catch (error) {
    console.error('❌ 初始化失败:', error.message);
    return false;
  }
}

/**
 * 同步数据库
 */
async function syncDatabase(options = {}) {
  const { direction = 'both', force = false } = options;
  
  console.log('🔄 开始同步数据库...');

  // 检查 Git 仓库是否存在
  if (!isGitRepo()) {
    console.error('❌ Git 仓库未初始化');
    console.log('提示：运行 node scripts/sync_db.js --init --remote <URL> 来初始化');
    return false;
  }

  try {
    // 拉取远程更新
    if (direction === 'pull' || direction === 'both') {
      console.log('📥 拉取远程更新...');
      try {
        if (force) {
          gitCommand('git fetch origin');
          gitCommand('git reset --hard origin/main');
          console.log('⚠️  强制同步：本地更改已被覆盖');
        } else {
          gitCommand('git pull --rebase origin main');
        }
        console.log('✅ 远程更新已拉取');
      } catch (error) {
        if (error.message.includes("couldn't find remote ref")) {
          console.log('ℹ️  远程仓库为空，跳过拉取');
        } else {
          throw error;
        }
      }
    }

    // 推送本地更改
    if (direction === 'push' || direction === 'both') {
      if (hasChanges()) {
        console.log('📤 提交本地更改...');
        gitCommand(`git add ${DB_FILE}`);
        const timestamp = new Date().toISOString();
        const hostname = require('os').hostname();
        gitCommand(`git commit -m "Auto sync from ${hostname} at ${timestamp}"`);

        console.log('⬆️  推送到远程仓库...');
        try {
          gitCommand('git push origin main');
          console.log('✅ 本地更改已推送');
        } catch (error) {
          // 如果是第一次推送
          if (error.message.includes('no upstream branch')) {
            gitCommand('git push -u origin main');
            console.log('✅ 首次推送完成');
          } else {
            throw error;
          }
        }
      } else {
        console.log('ℹ️  无本地更改需要推送');
      }
    }

    console.log('🎉 同步完成！');
    return true;
    
  } catch (error) {
    console.error('❌ 同步失败:', error.message);
    
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
      console.log('   node scripts/sync_db.js --force');
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
    remote: null,
    direction: 'both',
    force: false,
    status: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--init') {
      options.init = true;
    } else if (arg === '--remote' && i + 1 < args.length) {
      options.remote = args[++i];
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
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Mnemosyne 数据库同步工具

用法:
  node scripts/sync_db.js [选项]

选项:
  --init              初始化 Git 仓库
  --remote <URL>      设置远程仓库 URL（与 --init 一起使用）
  --pull              仅拉取远程更新
  --push              仅推送本地更改
  --force, -f         强制同步（覆盖本地更改）
  --status, -s        显示同步状态
  --help, -h          显示此帮助信息

示例:
  # 初始化并设置远程仓库
  node scripts/sync_db.js --init --remote https://github.com/user/mnemosyne-data.git

  # 双向同步（默认）
  node scripts/sync_db.js

  # 仅拉取更新
  node scripts/sync_db.js --pull

  # 强制同步（覆盖本地）
  node scripts/sync_db.js --force

  # 查看状态
  node scripts/sync_db.js --status
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
    showStatus();
  } else if (options.init) {
    if (!options.remote) {
      console.error('❌ 需要指定远程仓库 URL: --remote <URL>');
      process.exit(1);
    }
    const success = initRepo(options.remote);
    process.exit(success ? 0 : 1);
  } else {
    const success = await syncDatabase(options);
    process.exit(success ? 0 : 1);
  }
}

main().catch(error => {
  console.error('致命错误:', error);
  process.exit(1);
});
