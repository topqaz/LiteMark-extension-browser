// 后台服务脚本
let tokenCache = null;
let tokenExpiry = 0;
let categoriesCache = null;
let categoriesCacheTime = 0;
const CATEGORIES_CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 扩展安装时创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  console.log('LiteMark 书签助手已安装');
  createContextMenu();
  // 延迟加载分类，避免阻塞
  setTimeout(() => {
    updateContextMenuWithCategories();
  }, 500);
});

// 创建右键菜单
function createContextMenu() {
  // 清除旧的菜单项
  chrome.contextMenus.removeAll(() => {
    // 创建主菜单
    chrome.contextMenus.create({
      id: 'add-to-litemark',
      title: '添加到 LiteMark',
      contexts: ['page', 'link', 'selection']
    });
    
    // 添加"无分类"选项（默认）
    chrome.contextMenus.create({
      id: 'add-to-litemark-none',
      parentId: 'add-to-litemark',
      title: '无分类',
      contexts: ['page', 'link', 'selection']
    });
  });
}

// 更新菜单，添加分类子菜单
async function updateContextMenuWithCategories() {
  try {
    // 获取配置
    const config = await chrome.storage.sync.get(['apiUrl', 'username', 'password']);
    
    if (!config.apiUrl || !config.username || !config.password) {
      // 未配置，不更新菜单
      return;
    }
    
    // 获取分类列表
    const categories = await getCategories(config.apiUrl, config.username, config.password);
    
    if (categories.length === 0) {
      // 没有分类，保持当前菜单
      return;
    }
    
    // 检查分隔线是否已存在
    chrome.contextMenus.remove('add-to-litemark-separator', () => {
      // 添加分隔线
      chrome.contextMenus.create({
        id: 'add-to-litemark-separator',
        parentId: 'add-to-litemark',
        type: 'separator',
        contexts: ['page', 'link', 'selection']
      });
      
      // 添加分类子菜单
      categories.forEach((category, index) => {
        const menuId = `add-to-litemark-category-${index}`;
        // 先尝试移除，避免重复
        chrome.contextMenus.remove(menuId, () => {
          chrome.contextMenus.create({
            id: menuId,
            parentId: 'add-to-litemark',
            title: category,
            contexts: ['page', 'link', 'selection']
          });
        });
      });
    });
    
  } catch (error) {
    console.error('更新分类菜单失败:', error);
  }
}

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('右键菜单被点击', info.menuItemId, info, tab);
  
  // 检查是否是我们的菜单项
  if (!info.menuItemId || !info.menuItemId.startsWith('add-to-litemark')) {
    return;
  }
  
  try {
    // 获取配置
    const config = await chrome.storage.sync.get(['apiUrl', 'username', 'password']);
    
    if (!config.apiUrl || !config.username || !config.password) {
      // 显示通知提示配置
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/LiteMark48.png',
        title: 'LiteMark 书签助手',
        message: '请先配置 LiteMark 地址和登录信息（点击扩展图标）'
      });
      // 打开配置页面
      chrome.action.openPopup();
      return;
    }
    
    // 确定要添加的 URL 和标题
    let url = '';
    let title = '';
    
    // 优先使用选中文本作为标题（如果用户选中了文本）
    const hasSelection = info.selectionText && info.selectionText.trim();
    
    if (info.linkUrl) {
      // 如果右键点击的是链接
      url = info.linkUrl;
      // 标题优先级：选中文本 > 链接文本 > 网站标题 > "链接"
      if (hasSelection) {
        title = info.selectionText.trim();
      } else if (info.linkText && info.linkText.trim()) {
        title = info.linkText.trim();
      } else if (tab.title) {
        title = tab.title;
      } else {
        title = '链接';
      }
    } else {
      // 添加当前页面
      url = tab.url;
      // 标题优先级：选中文本 > 网站标题
      if (hasSelection) {
        title = info.selectionText.trim();
      } else if (tab.title) {
        title = tab.title;
      } else {
        title = url; // 如果都没有，使用 URL
      }
    }
    
    // 确定分类
    let category = undefined;
    if (info.menuItemId === 'add-to-litemark-none') {
      category = undefined; // 无分类
    } else if (info.menuItemId.startsWith('add-to-litemark-category-')) {
      // 从菜单项ID中提取分类索引
      const index = parseInt(info.menuItemId.replace('add-to-litemark-category-', ''));
      const categories = await getCategories(config.apiUrl, config.username, config.password);
      if (categories[index] !== undefined) {
        category = categories[index];
      }
    }
    
    // 获取 Token（可能需要登录）
    const token = await getToken(config.apiUrl, config.username, config.password);
    
    if (!token) {
      throw new Error('无法获取登录 Token');
    }
    
    // 添加书签
    const response = await fetch(`${config.apiUrl}/api/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: title.substring(0, 200), // 限制标题长度
        url: url,
        category: category,
        visible: true
      })
    });
    
    if (!response.ok) {
      let errorMessage = '添加失败';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
    
    const bookmark = await response.json();
    
    // 清除分类缓存，以便下次显示最新分类
    categoriesCache = null;
    categoriesCacheTime = 0;
    
    // 显示成功通知
    const categoryText = category ? `（${category}）` : '';
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/LiteMark48.png',
      title: '添加成功',
      message: `"${title.substring(0, 40)}" 已添加到 LiteMark${categoryText}`
    });
    
    console.log('书签添加成功:', bookmark);
    
    // 更新菜单以反映新的分类（如果有新分类）
    setTimeout(() => {
      updateContextMenuWithCategories();
    }, 1000);
    
  } catch (error) {
    console.error('添加书签失败:', error);
    
    // 显示错误通知
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/LiteMark48.png',
      title: '添加失败',
      message: error.message || '未知错误'
    });
  }
});

// 获取分类列表（带缓存）
async function getCategories(apiUrl, username, password) {
  // 检查缓存
  const now = Date.now();
  if (categoriesCache && categoriesCacheTime > now) {
    return categoriesCache;
  }
  
  try {
    // 获取 Token
    const token = await getToken(apiUrl, username, password);
    
    // 获取所有书签
    const response = await fetch(`${apiUrl}/api/bookmarks`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('获取书签列表失败');
    }
    
    const bookmarks = await response.json();
    
    // 提取所有唯一的分类
    const categorySet = new Set();
    bookmarks.forEach(bookmark => {
      if (bookmark.category && bookmark.category.trim()) {
        categorySet.add(bookmark.category.trim());
      }
    });
    
    // 转换为数组并排序
    const categories = Array.from(categorySet).sort();
    
    // 缓存结果
    categoriesCache = categories;
    categoriesCacheTime = now + CATEGORIES_CACHE_DURATION;
    
    console.log('获取到分类列表:', categories);
    return categories;
    
  } catch (error) {
    console.error('获取分类失败:', error);
    // 返回空数组，不缓存错误结果
    return [];
  }
}

// 获取 Token（带缓存）
async function getToken(apiUrl, username, password) {
  // 检查缓存
  const now = Date.now();
  if (tokenCache && tokenExpiry > now) {
    return tokenCache;
  }
  
  try {
    const response = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    if (!response.ok) {
      throw new Error('登录失败');
    }
    
    const data = await response.json();
    tokenCache = data.token;
    // Token 缓存 1 小时
    tokenExpiry = now + 60 * 60 * 1000;
    
    return tokenCache;
  } catch (error) {
    console.error('获取 Token 失败:', error);
    tokenCache = null;
    tokenExpiry = 0;
    throw error;
  }
}

// 监听配置变化，清除缓存并更新菜单
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && (changes.apiUrl || changes.username || changes.password)) {
    console.log('配置已更改，清除缓存并更新菜单');
    tokenCache = null;
    tokenExpiry = 0;
    categoriesCache = null;
    categoriesCacheTime = 0;
    // 重新创建菜单
    createContextMenu();
    // 延迟更新分类菜单
    setTimeout(() => {
      updateContextMenuWithCategories();
    }, 500);
  }
});

// 扩展启动时也更新菜单
chrome.runtime.onStartup.addListener(() => {
  console.log('扩展启动，更新菜单');
  setTimeout(() => {
    updateContextMenuWithCategories();
  }, 1000);
});
