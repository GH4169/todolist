# 数据备份与迁移

备份由 Supabase CLI 通过已授权的 Management API 读取，不需要数据库密码。仓库维护者已选择公开解密密钥，因此仓库中的加密归档对任何人都可解开，不提供数据保密性。

当前公开密钥文件为 `backups/backup.agekey`。不要用它保护希望保密的数据；如需保密，应创建新的私有密钥，并将密文存放在私有仓库或离线备份中。

## 首次准备

虚拟机已安装 Supabase CLI 与 age。登录 Supabase CLI 并链接项目：

```sh
npx supabase login
npx supabase link --project-ref zfxvwlddhxhjumwedsjt
```

生成本机解密密钥：

```sh
mkdir -p ~/.config/todolist
chmod 700 ~/.config/todolist
age-keygen -o ~/.config/todolist/backup.agekey
chmod 600 ~/.config/todolist/backup.agekey
```

通常应把 `~/.config/todolist/backup.agekey` 另存到离线位置。当前仓库公开了这把密钥，因此不需要为本仓库归档另存密钥；任何克隆仓库的人都可以解密归档。

## 创建并上传备份

```sh
./scripts/backup-supabase.sh
git add backups/*.tar.gz.age backups/*.tar.gz.age.sha256
git commit -m "backup encrypted Supabase data"
git push
```

归档内的 `portable-data.json` 包含全部 `public` 表数据，以及 `auth.users` 和 `auth.identities`，因此保留业务数据、用户 ID 和密码哈希。`manifest.json` 记录表行数，不含用户内容。归档还附带仓库里的 `supabase-schema.sql` 作为源端结构参考。

## 解密检查或恢复

```sh
sha256sum -c backups/todolist-时间.tar.gz.age.sha256
./scripts/extract-supabase-backup.sh backups/todolist-时间.tar.gz.age
```

从其他设备解密时，可使用仓库中的公开密钥：

```sh
AGE_IDENTITY_FILE=backups/backup.agekey ./scripts/extract-supabase-backup.sh backups/todolist-时间.tar.gz.age
```

解密文件会写入被 Git 忽略的 `backup-extracted/`，不可提交。做过一次成功的解密检查，才能确认备份密钥匹配。

## 迁移到 CloudBase

`portable-data.json` 是数据导出，不是可直接覆盖目标数据库的完整 SQL。迁移时需按 CloudBase 表结构导入，并确认 RLS、主键与外键。CloudBase 管理自己的 `auth` schema，官方迁移说明不建议直接恢复 Supabase `auth` 表；用户可能需要重新激活，或由平台协助批量迁移。导出的密码哈希为保留迁移选项，不代表 CloudBase 一定能直接接受。

当前应用还使用 Supabase Realtime Broadcast、Edge Functions 和加密保存的 AI 提供商凭据。这些需要分别迁移；数据库备份本身不能保证切换后用户完全无感。`integration_tokens` 只保存令牌哈希，原始令牌无法从备份恢复。
