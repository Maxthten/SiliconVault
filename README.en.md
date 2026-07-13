**Read this in other languages: [English](README.en.md), [中文](README.md).**

# SiliconVault - Electronic Component Inventory Management System

> Are you troubled by too many electronic components to manage? Are you frustrated by complex professional management software that's difficult to configure? Here's an electronic component management software perfect for electronics enthusiasts, ensuring core functionality is absolutely stable and reliable, with a modern UI design.
> 
> For corporate management, please consider other software. This is designed for personal management by electronics enthusiasts.
> 
> Visual guide available: [Say Goodbye to Chaos: How I Use SiliconVault to Elegantly Manage Electronic Component Inventory • Maxton's Blog](https://zh.maxtonniu.com/blog/siliconvault/)

## 🚀 Project Introduction

**SiliconVault** is a modern electronic component inventory management system built with Electron + Vue 3 + TypeScript. It's specifically designed for electronics engineers, makers, and hardware enthusiasts to help efficiently manage component inventory, BOM lists, and production workflows.

Imagine: You'll never have to search through component boxes for that specific 10kΩ resistor again, nor worry about discovering insufficient stock of critical chips during production. SiliconVault is your digital component manager!

## ✨ Core Features

### 📦 Smart Inventory Management

- **Category Management**: Supports 10+ component categories including resistors, capacitors, inductors, chips, etc.
- **Custom Fields**: Different categories have specific field labels (e.g., "Resistance" for resistors, "Capacitance" for capacitors)
- **Image & Documentation**: Supports uploading component images and datasheets
- **Location Tracking**: Records component storage locations, eliminating the "can't find it" dilemma
- **Smart Search**: Multi-dimensional search by name, parameters, category, etc.
- **Batch Operations**: Supports batch inventory adjustments and information editing

### 🏭 BOM Project Management

- **Project Lists**: Create and manage BOM project lists
- **Smart Association**: BOM projects automatically link with inventory data
- **Production Execution**: One-click inventory deduction with batch production quantity settings
- **Inventory Alerts**: Automatic stock sufficiency checks before production
- **Drag & Drop Sorting**: Intuitive drag-and-drop interface for project ordering
- **File Association**: Supports linking schematic diagrams, PCB files, and other documents

### 📊 Consumption Analytics Dashboard

- **Real-time Statistics**: Analyze component consumption by day/week/month
- **Visual Charts**: Timeline trend charts, category rose charts, heat maps
- **Smart Analysis**: Automatic identification of high-consumption components and active projects
- **Consumption Intensity**: Low/Medium/High consumption intensity assessment
- **Project Tracking**: Track consumption history for specific projects
- **Data Drill-down**: Direct drill-down from charts to detailed data

### 🔄 Data Operations Center

- **Batch Editing**: Supports batch inventory quantity adjustments
- **Drag & Drop Sorting**: Intuitive drag-and-drop interface management
- **Import/Export**: CSV import/export, supports complete resource packages (.svdata)
- **Operation Logs**: Complete operation history with undo functionality
- **Conflict Resolution**: Smart detection of import conflicts with resolution options
- **Template Downloads**: Provides standard import templates

### 🛡️ System Maintenance & Monitoring

- **Automatic Backup**: Scheduled automatic database backups
- **Resource Cleanup**: Intelligent scanning and cleanup of unused images and documents
- **Database Optimization**: Regular VACUUM optimization for database performance
- **Replenishment Monitoring**: Smart monitoring of low stock with replenishment reminders
- **Pause Functionality**: Supports temporary suspension of replenishment alerts
- **Health Check**: Real-time system health status monitoring

### ⚡ Performance & User Experience

- **Dark Theme**: Modern dark interface design, protecting eyesight
- **Responsive Layout**: Adapts to different screen sizes
- **Animation Effects**: Smooth page transition animations
- **Keyboard Shortcuts**: Supports keyboard shortcuts for common operations
- **Offline Usage**: Completely local storage, no internet connection required
- **Multi-platform Support**: Full support for Windows, macOS, and Linux

## 🛠️ Technology Stack

### Frontend Technologies

- **Vue 3** - Modern frontend framework using Composition API
- **TypeScript** - Type-safe development experience
- **Naive UI** - Elegant UI component library
- **Vue Router** - Single-page application routing
- **Vue Draggable Plus** - Drag-and-drop functionality support
- **ECharts** - Data visualization chart library
- **Vicons** - Rich icon library support

### Backend Technologies

- **Electron** - Cross-platform desktop application framework
- **Better-SQLite3** - High-performance local database
- **Electron Store** - Application configuration storage
- **Adm-Zip** - ZIP compression/decompression functionality
- **PapaParse** - CSV file parsing
- **Node.js** - Backend runtime environment

### Development Tools

- **Vite** - Fast build tool
- **Electron Vite** - Electron-specific build configuration
- **ESLint + Prettier** - Code quality and formatting
- **Vue TSC** - Vue TypeScript type checking
- **Electron Builder** - Application packaging tool

## 📁 Project Structure

```
SiliconVault/
├── src/
│   ├── main/           # Main process code
│   │   ├── index.ts    # Application entry and window management
│   │   ├── db.ts       # Database operations core
│   │   ├── backup.ts   # Backup management
│   │   ├── maintenance.ts # System maintenance
│   │   └── analytics.ts # Consumption analysis statistics
│   ├── preload/        # Preload scripts
│   │   └── index.ts    # Main-renderer process communication
│   └── renderer/       # Renderer process
│       └── src/
│           ├── assets/ # Static resources
│           ├── components/ # Reusable components
│           │   ├── InventoryCard.vue      # Inventory card component
│           │   ├── BomEditModal.vue      # BOM edit modal
│           │   ├── BomRunModal.vue       # Production execution modal
│           │   ├── CategoryRuleModal.vue # Category rule configuration
│           │   ├── ImportConflictModal.vue # Import conflict resolution
│           │   ├── ExportWizardModal.vue # Export wizard
│           │   ├── EditDialog.vue         # Edit dialog
│           │   ├── BatchEditModal.vue    # Batch editing
│           │   ├── Sidebar.vue           # Sidebar navigation
│           │   ├── BottomBar.vue         # Bottom tab bar
│           │   ├── TitleBar.vue          # Title bar
│           │   └── ThemeToggle.vue       # Theme toggle component
│           ├── views/  # Page views
│           │   ├── Inventory.vue      # Inventory management
│           │   ├── BomProject.vue     # BOM project management
│           │   ├── Consumption.vue    # Consumption dashboard
│           │   ├── ReplenishView.vue  # Replenishment monitoring
│           │   ├── OperationLog.vue   # Operation logs
│           │   ├── DataCenter.vue     # Data center
│           │   └── SettingsView.vue   # System settings
│           ├── router/ # Routing configuration
│           ├── config/ # Configuration files
│           │   └── animations.ts       # Animation configuration
│           ├── utils/   # Utility functions
│           │   └── theme.ts           # Theme configuration
│           └── data/   # Static data
│               └── quotes.ts           # Quote data
├── resources/          # Application resource files
│   ├── icon.icns       # macOS icon
│   ├── icon.ico        # Windows icon
│   ├── icon.png        # Linux icon
│   ├── license.txt     # License file
│   └── inventory.db    # Sample database
├── build/             # Build configuration and icons
└── dist/              # Build output directory
```

## 🚀 Quick Start

### Environment Requirements

- Node.js 18+
- pnpm 8+ (recommended) or npm 9+
- Git (for version control)

### Install Dependencies

```bash
# Using pnpm (recommended)
pnpm install

# Or using npm
npm install
```

### Development Mode

```bash
# Start development server
pnpm dev
```

### Build Application

```bash
# Windows
pnpm build:win

# macOS
pnpm build:mac

# Linux
pnpm build:linux

# Build only (no packaging)
pnpm build:unpack
```

### Code Quality Checks

```bash
# Type checking
pnpm typecheck

# Code formatting
pnpm format

# Code linting
pnpm lint
```

## 💡 Usage Guide

### First Time Use

1. After starting the application, the system will automatically create a `SiliconVault` folder in your documents directory
2. Database file `inventory.db` will store all inventory data
3. Image and document resources are stored in the `assets` subdirectory
4. Backup files are stored in the `backups` subdirectory

### Adding Components

1. Go to the Inventory Management page
2. Click the "+" button to add a new component
3. Fill in the appropriate fields based on category
4. Upload images and datasheets (optional)
5. Set minimum stock threshold
6. Record storage location information

### Creating BOM Projects

1. Go to the BOM Project Management page
2. Create a new project and fill in the description
3. Select components from inventory to add to BOM
4. Set usage quantity for each component
5. Associate relevant document files
6. Set project priority and sorting

### Production Execution

1. Click "Production Execution" on the BOM project page
2. Set production quantity
3. System automatically checks stock sufficiency
4. Confirm to automatically deduct inventory
5. Generate production records
6. Update consumption statistics

### Consumption Analysis (New Feature)

1. Go to the Consumption Dashboard page
2. Select time range (Day/Week/Month)
3. View consumption trends, category statistics, and heat maps
4. Analyze high-consumption components and active projects
5. Drill down to view detailed consumption records
6. Export analysis reports

### Data Management

1. Go to the Data Center page
2. Select import/export functions
3. Use CSV templates for batch import
4. Export complete resource packages for data migration
5. Handle import conflicts
6. Download standard templates

## 🔧 Advanced Features

### Batch Operations

- Supports batch inventory quantity adjustments
- Can set increase or decrease mode
- Automatic negative stock risk checking
- Supports batch operations filtered by category
- Provides operation preview and confirmation

### Data Import/Export

- **CSV Import**: Import data from Excel or other systems
- **CSV Export**: Export to spreadsheet format
- **Resource Package Export**: Export complete projects including images and documents
- **Template Downloads**: Provides standard import templates
- **Conflict Resolution**: Smart detection and resolution of import conflicts

### System Settings

- Custom storage path
- Backup and restore functionality
- Database optimization tools
- Resource cleanup tools
- Animation effect configuration
- Theme switching support

### Replenishment Monitoring

- Real-time inventory status monitoring
- Smart low-stock alerts
- Supports pause monitoring function
- Custom monitoring thresholds
- Health status visualization

## ⚡ Performance Optimization

### Database Performance

- **SQLite Optimization**: Uses Better-SQLite3 for high-performance database operations
- **Query Optimization**: All database queries are performance-optimized
- **Index Usage**: Key fields are indexed to improve query speed
- **Transaction Processing**: Batch operations use transactions to ensure data consistency
- **Connection Pool Management**: Optimized database connection usage

### Memory Management

- **Lazy Loading**: Images and documents load on demand, reducing memory usage
- **Virtual Scrolling**: Large data lists use virtual scrolling technology
- **Cache Strategy**: Frequently accessed data is cached
- **Resource Cleanup**: Automatic cleanup of unused images and documents
- **Garbage Collection**: Optimized memory usage and recycling

### Responsive Optimization

- **Vue 3 Reactivity**: Utilizes Vue 3's Composition API for optimized reactive performance
- **Component Optimization**: Key components are performance-optimized and lazy-loaded
- **Rendering Optimization**: Reduces unnecessary re-renders
- **Event Optimization**: Optimizes event handling performance
- **Animation Optimization**: Uses CSS animations for better performance

### Build Optimization

- **Vite Build**: Uses Vite for fast builds and hot reload
- **Code Splitting**: On-demand code loading reduces initial bundle size
- **Tree Shaking**: Automatically removes unused code
- **Compression Optimization**: Resource file compression optimization
- **Cache Strategy**: Build cache improves development efficiency

## 🐛 Troubleshooting

### Common Issues

**Q: Application fails to start or shows blank screen?**
A: Try deleting the `SiliconVault` folder in your user data directory and restart

**Q: Image upload fails?**
A: Check if the application has file system read/write permissions

**Q: Database corruption?**
A: Use the "Database Optimization" function in settings or restore from backup

**Q: Consumption statistics inaccurate?**
A: Ensure operation logs are complete; consumption statistics are calculated based on operation logs

**Q: Application runs slowly?**
A: Try cleaning unused resource files and optimizing the database

**Q: Data import fails?**
A: Check if the CSV file format is correct; use the standard template

### Performance Optimization Recommendations

1. **Regular Cleanup**: Use the resource cleanup function in system settings
2. **Database Optimization**: Perform database optimization monthly
3. **File Management**: Delete unnecessary images and documents promptly
4. **Data Backup**: Regularly back up important data
5. **System Updates**: Keep the application version updated

### Log Viewing

Application operation logs are stored in the database and can be viewed through the "Operation Logs" page for detailed operation history.

## 🤝 Contribution Guidelines

We welcome contributions of all kinds! Whether it's code improvements, documentation enhancements, or feature suggestions, you can participate in the following ways:

1. Fork this project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Standards

- Use TypeScript for type safety
- Follow ESLint and Prettier code standards
- Run `pnpm typecheck` and `pnpm lint` before committing
- Add appropriate comments and documentation for new features
- Performance Optimization: New features should consider performance impact
- Test Coverage: Important features need test cases

### Feature Suggestions

If you have new feature ideas, please first check:

1. Whether it aligns with the project positioning (personal use by electronics enthusiasts)
2. Whether similar functionality already exists or is planned
3. Whether it will affect the stability of existing features

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.
View the [LICENSE](resources/license.txt) file for details.

This means:

1. 🛡️ **Free and Open**: Anyone can use, modify, and distribute this software for free.
2. 🔄 **Mandatory Open Source**: If you modify this software or develop network services (SaaS) based on it, you must disclose your modified code to users.
3. ⚖️ **Disclaimer**: This software is provided "as is" without any warranty.

## 🙏 Acknowledgments

Thanks to the following open-source projects for providing technical support to SiliconVault:

- [Electron](https://electronjs.org/) - Cross-platform desktop application framework
- [Vue.js](https://vuejs.org/) - Progressive JavaScript framework
- [Naive UI](https://www.naiveui.com/) - Elegant Vue component library
- [Better-SQLite3](https://github.com/JoshuaWise/better-sqlite3) - High-performance SQLite driver
- [ECharts](https://echarts.apache.org/) - Powerful data visualization library
- [Vicons](https://www.xicons.org/) - Rich icon library
- [Vue Draggable Plus](https://github.com/alexxiyang/vue-draggable-plus) - Drag-and-drop functionality support

## 🔮 Future Plans

### Planned Features

- [x] Multi-language support (Chinese/English switching)

- [x] Theme switching functionality (Light/Dark mode)

- [  ] Mobile version

- [  ] Cloud synchronization functionality

---

**Friendly Reminder**: While SiliconVault can help you manage components, it can't help you find that 0805 capacitor that fell on the floor. That still depends on your good eyesight! 👀

**Performance Tip**: If your component library exceeds 1000 items, we recommend regularly using the database optimization function, just like giving your computer a "disk defragmentation" - it makes the system run smoother!

**Security Tip**: Please back up important data regularly. SiliconVault provides comprehensive backup mechanisms, but data security ultimately depends on the user!

---

*Made with ❤️ for the electronics community*

---

**Version Information**: v1.4.0 (Beta)
**Last Updated**: 2026-07-13  
**Technical Support**: If you encounter issues, please submit an Issue or contact the developer
