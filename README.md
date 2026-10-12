# Auto Refresh + Countdown

> A Manifest V3 Chrome extension: auto-refresh a page on a schedule, with a translucent click-through countdown pill. Configuration is **per site** and lives in the toolbar popup — a page stays completely untouched until you enable it there.

为单个站点配置自动刷新间隔；页面默认**零注入**，开启后只多出一个半透明、鼠标穿透的倒计时胶囊。

## 特性

- **逐站点开关，默认全关**：没有配置过的网站，页面里不会有任何扩展 DOM、不会挂任何定时器。
- **配置只在工具栏 popup**：当前站点开关 + 间隔 `5 / 10 / 30 / 60 分钟`，图标 badge 显示当前状态（如 `5m`）。
- **开启即刻生效**：用 `chrome.scripting` 注入内容脚本，当前已打开的页面不用刷新就能看到倒计时。
- **倒计时胶囊**：半透明毛玻璃、`分:秒` 读数，胶囊本体鼠标穿透（`pointer-events: none`），不挡页面操作。
- **暂停 / 继续按钮**：胶囊里唯一可点的元素。
  - 暂停 → 倒计时冻结、取消刷新，文案变「已暂停」、指示灯转琥珀色；
  - 继续 → 从**剩余时间**接着走，而不是重新计一整段；
  - 暂停只作用于当前页面（不写入配置），手动刷新页面会回到运行状态。
- **无网络请求、无埋点、无远程代码**，全部逻辑都在本仓库这几个文件里。

## 安装（开发者模式）

1. 克隆或下载本仓库；
2. 打开 `chrome://extensions`，右上角打开「开发者模式」；
3. 点「加载已解压的扩展程序」，选择本仓库目录；
4. 打开任意网页，点工具栏上的扩展图标配置该站点。

> 安装时 Chrome 会提示「读取和更改您在所有网站上的数据」，这是内容脚本匹配 `<all_urls>` 的常规提示；扩展只在本机读写 `chrome.storage.local`。

## 使用

| 操作 | 位置 |
| --- | --- |
| 为当前站点开启 / 关闭 | 工具栏图标 → popup 里的开关 |
| 切换间隔（5/10/30/60 分钟） | popup 里的四档按钮 |
| 查看某站点是否开启 | 工具栏图标上的 badge（`5m` / 空） |
| 临时暂停 / 继续倒计时 | 页面胶囊右侧的按钮 |

`chrome://`、扩展商店、新标签页等受限页面无法注入，popup 会提示「此页面不支持」。

## 存储格式

配置保存在 `chrome.storage.local`，按 origin 隔离：

```json
{
  "site:https://example.com": { "enabled": true, "interval": 300000 },
  "defaultInterval": 300000
}
```

未开启 = 没有该 key 或 `enabled: false`。UI 只提供分钟档，`interval` 字段本身接受任意毫秒值。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存每个站点的开关与间隔 |
| `scripting` | popup 里开启时立即注入内容脚本（免刷新生效） |
| `host_permissions: <all_urls>` | 内容脚本需要在任意网站上运行；也用于读取当前标签页地址以定位站点 |

## 文件结构

```
manifest.json     MV3 清单：权限、action popup、service worker、内容脚本声明
content.js        内容脚本：默认静默；开启后渲染胶囊与暂停按钮；监听 storage 变化即时启停
popup.html/.js    配置面板：当前站点开关、间隔四档、写 storage、补注入、写 badge
background.js     service worker：只负责按当前站点配置刷新图标 badge
```

## 开发

改完代码后在 `chrome://extensions` 点该扩展卡片上的 ↻ 即可热重载，扩展 ID 不变。

## 版本

- v1.0.0 页面常驻「⟳ 5s」小按钮 + 胶囊（localStorage 配置）
- v1.1.0 间隔改为 5/10/30/60 分钟，倒计时改 `分:秒`
- v1.2.0 改为 popup 逐站点配置；页面默认零注入；胶囊鼠标穿透；badge 显示状态
- v1.3.0 胶囊新增「暂停 / 继续」按钮（暂停冻结倒计时、不写配置）

## License

[MIT](LICENSE)
