# 拉屎记录器 (Bowel Movement Recorder)

一个简单易用的排便习惯记录应用，帮助您追踪和分析排便情况。

## 功能特性

- ✅ **添加记录**：快速记录排便时间、地点和备注
- 📋 **历史记录**：查看和管理所有排便记录
- 📊 **数据分析**：
  - 平均间隔时间
  - 本周排便次数
  - 常用地点统计
  - 14天趋势图表
- 🔍 **筛选功能**：按日期范围筛选记录
- 📤 **数据导出**：将记录导出为JSON文件
- 📥 **数据导入**：从JSON文件导入记录
- 🎨 **美观界面**：现代化的设计，流畅的动画效果
- 📱 **响应式设计**：适配各种屏幕尺寸

## 技术栈

- **Vite**：开发服务器与生产构建
- **HTML5**：页面结构
- **Tailwind CSS v3**：样式框架（构建时编译）
- **JavaScript (ES Modules)**：模块化交互逻辑
- **Chart.js**：数据可视化
- **Font Awesome**：图标库
- **LocalStorage + Web Crypto API (AES-GCM)**：本地数据加密存储

## 使用方法

### 基本使用

1. **添加记录**：
   - 点击顶部"添加"标签
   - 选择地点（或输入其他地点）
   - 添加备注（可选）
   - 点击"记录"按钮保存

2. **查看历史记录**：
   - 点击顶部"历史"标签
   - 浏览所有记录
   - 点击筛选按钮可按日期范围过滤
   - 点击删除图标可删除记录

3. **查看分析**：
   - 点击顶部"分析"标签
   - 查看平均间隔、本周次数和常用地点
   - 查看14天趋势图表

### 数据管理

- **导出数据**：在历史记录页面点击"导出"按钮
- **导入数据**：在历史记录页面点击"导入"按钮，选择JSON文件

## 项目结构

```
拉屎记录器/
├── index.html          # 主页面文件
├── vite.config.js      # Vite 构建配置
├── tailwind.config.js  # Tailwind 主题配置
├── postcss.config.js   # PostCSS 配置
├── public/
│   └── libs/           # 第三方静态资源（Chart.js、Font Awesome 等）
└── src/
    ├── main.js         # 应用入口（构建入口）
    ├── css/
    │   ├── main.css    # Tailwind 指令 + 自定义 utilities
    │   └── app.css     # 应用自定义样式
    └── js/
        ├── app.js      # 应用初始化 + 事件绑定
        ├── state.js    # 共享状态与 DOM 引用
        ├── storage.js  # 数据持久化层（记录/备份）
        ├── crypto.js   # 加密解密
        ├── records.js  # 记录管理（表单/列表/筛选/编辑删除）
        ├── dataio.js   # 数据导入导出/备份恢复
        ├── stats.js    # 统计信息
        ├── chart.js    # 趋势图表
        ├── swipe.js    # 标签切换与滑动
        ├── settings.js # 设置与主题
        ├── ui.js       # Toast / 通用确认模态框
        └── utils.js    # 工具函数
```

## 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 开发说明

### 环境准备

```bash
npm install
```

### 本地运行（开发模式，支持热更新）

```bash
npm run dev
```

访问终端输出的地址（默认 `http://localhost:5173`）。

### 生产构建与预览

```bash
npm run build      # 构建产物输出到 dist/
npm run preview    # 本地预览构建产物
```

### 代码修改

- 页面结构：修改 `index.html`
- 样式：修改 `src/css/app.css`；Tailwind 主题在 `tailwind.config.js`
- 逻辑：按职责修改 `src/js/` 下的模块

## 隐私说明

- 所有数据仅存储在您的本地浏览器中
- 不会向任何服务器发送数据
- 您可以随时导出数据备份

## 许可证

MIT License

## 更新日志

### v1.0.0 (2025-11-27)
- 初始版本发布
- 实现基本记录功能
- 实现历史记录管理
- 实现数据分析功能
- 实现数据导入导出功能

## 贡献

欢迎提交Issue和Pull Request！

## 联系方式

如有问题或建议，欢迎通过GitHub Issues反馈。