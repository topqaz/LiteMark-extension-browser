
let tokenCache = null;
let tokenExpiry = 0;
let categoriesCache = null;
let categoriesCacheTime = 0;
const CATEGORIES_CACHE_DURATION = 5 * 60 * 1000;


chrome.runtime.onInstalled.addListener(() => {
  console.log('LiteMark 书签助手已安装');
  createContextMenu();
});


chrome.runtime.onStartup.addListener(() => {
  console.log('扩展启动，更新菜单');
  setTimeout(() => {
    createContextMenu();
  }, 1000);
});


async function createContextMenu() {
  try {

    const config = await chrome.storage.sync.get(['apiUrl', 'username', 'password', 'enableAI']);
    const enableAI = config.enableAI || false;


    await chrome.contextMenus.removeAll();


    chrome.contextMenus.create({
      id: 'add-to-litemark',
      title: '添加到 LiteMark',
      contexts: ['page', 'link', 'selection']
    });


    if (enableAI) {
      chrome.contextMenus.create({
        id: 'ai-smart-add',
        parentId: 'add-to-litemark',
        title: '🤖 AI 智能添加（完全自动）',
        contexts: ['page', 'link', 'selection']
      });


      chrome.contextMenus.create({
        id: 'separator-1',
        parentId: 'add-to-litemark',
        type: 'separator',
        contexts: ['page', 'link', 'selection']
      });
    }

    console.log('右键菜单创建成功');

    if (config.apiUrl && config.username && config.password) {
      setTimeout(() => {
        updateCategoryMenu(enableAI);
      }, 500);
    }
  } catch (error) {
    console.error('创建右键菜单失败:', error);
  }
}


async function updateCategoryMenu(enableAI) {
  try {

    const config = await chrome.storage.sync.get(['apiUrl', 'username', 'password']);

    if (!config.apiUrl || !config.username || !config.password) {
      console.log('未配置 LiteMark，跳过分类菜单更新');
      return;
    }


    const categories = await getCategories(config.apiUrl, config.username, config.password);

    if (categories.length > 0) {

      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];


        chrome.contextMenus.create({
          id: `category-${i}`,
          parentId: 'add-to-litemark',
          title: `📁 ${category}`,
          contexts: ['page', 'link', 'selection']
        });


        if (enableAI) {
          chrome.contextMenus.create({
            id: `category-${i}-ai`,
            parentId: `category-${i}`,
            title: '🤖 AI 生成内容',
            contexts: ['page', 'link', 'selection']
          });
        }

        chrome.contextMenus.create({
          id: `category-${i}-direct`,
          parentId: `category-${i}`,
          title: '📝 直接添加',
          contexts: ['page', 'link', 'selection']
        });
      }
    }

    console.log(`分类菜单更新成功，共 ${categories.length} 个分类`);
  } catch (error) {
    console.error('更新分类菜单失败:', error);
  }
}


chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('右键菜单被点击', info.menuItemId, info, tab);


  if (!info.menuItemId || !info.menuItemId.toString().startsWith('add-to-litemark') &&
      !info.menuItemId.toString().startsWith('ai-smart-add') &&
      !info.menuItemId.toString().startsWith('category-')) {
    return;
  }

  try {

    const config = await chrome.storage.sync.get(['apiUrl', 'username', 'password', 'enableAI']);

    if (!config.apiUrl || !config.username || !config.password) {

      await showNotification({
        title: 'LiteMark 书签助手',
        message: '请先配置 LiteMark 地址和登录信息（点击扩展图标）',
        iconUrl: 'icons/LiteMark48.png'
      });
      return;
    }


    const menuId = info.menuItemId.toString();

    const { url, title } = extractUrlAndTitle(info, tab);


    if (menuId === 'ai-smart-add') {

      await handleAISmartAdd(url, title, config);
    } else if (menuId === 'add-to-litemark') {
      // 主菜单项：直接添加到默认分类
      await handleDirectAdd(url, title, config);
    } else if (menuId.startsWith('category-')) {

      await handleCategoryAdd(menuId, url, title, config);
    }

  } catch (error) {
    console.error('添加书签失败:', error);
    await showNotification({
      title: '❌ 添加失败',
      message: error.message || '未知错误',
      iconUrl: 'icons/LiteMark48.png'
    });
  }
});


function extractUrlAndTitle(info, tab) {
  let url = '';
  let title = '';


  const hasSelection = info.selectionText && info.selectionText.trim();

  if (info.linkUrl) {

    url = info.linkUrl;

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

    url = tab.url;

    if (hasSelection) {
      title = info.selectionText.trim();
    } else if (tab.title) {
      title = tab.title;
    } else {
      title = url;
    }
  }

  return { url, title };
}

// 处理直接添加（主菜单项）
async function handleDirectAdd(url, title, config) {
  try {
    const token = await getToken(config.apiUrl, config.username, config.password);

    if (!token) {
      throw new Error('无法获取登录 Token');
    }

    const response = await fetch(`${config.apiUrl}/api/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: title.substring(0, 200),
        url: url,
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

    await showNotification({
      title: '✅ 添加成功',
      message: title.substring(0, 50),
      iconUrl: 'icons/LiteMark48.png'
    });

    console.log('书签添加成功:', bookmark);

    // 清除分类缓存
    categoriesCache = null;
    categoriesCacheTime = 0;

    setTimeout(() => {
      createContextMenu();
    }, 1000);

  } catch (error) {
    console.error('添加书签失败:', error);
    throw error;
  }
}

// 处理 AI 智能添加
async function handleAISmartAdd(url, title, config) {

  const notificationId = await showNotification({
    title: '🤖 AI 正在处理',
    message: '正在分析网页内容，生成智能书签...',
    iconUrl: 'icons/LiteMark48.png',
    autoClear: false  // 不自动清除，等待手动清除
  });

  try {

    const token = await getToken(config.apiUrl, config.username, config.password);

    if (!token) {
      throw new Error('无法获取登录 Token');
    }

    const response = await fetch(`${config.apiUrl}/api/ai/quick-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      let errorMessage = 'AI 添加失败';
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


    categoriesCache = null;
    categoriesCacheTime = 0;


    if (notificationId) {
      await new Promise(resolve => {
        chrome.notifications.clear(notificationId, () => {
          // 延迟 200ms 再显示新通知，确保旧通知完全清除
          setTimeout(resolve, 200);
        });
      });
    }


    const categoryText = bookmark.category ? ` · ${bookmark.category}` : '';
    const tagsText = bookmark.tags ? ` · ${bookmark.tags}` : '';

    await showNotification({
      title: '🤖 AI 添加成功',
      message: `${bookmark.title.substring(0, 40)}${categoryText}${tagsText}`,
      iconUrl: 'icons/LiteMark48.png',
      autoClear: true,
      duration: 5000
    });

    console.log('AI 书签添加成功:', bookmark);


    setTimeout(() => {
      createContextMenu();
    }, 1000);

  } catch (error) {
    console.error('AI 添加书签失败:', error);

    if (notificationId) {
      chrome.notifications.clear(notificationId);
    }

    throw error;
  }
}


async function handleCategoryAdd(menuId, url, title, config) {
  try {

    const parts = menuId.split('-');
    const isNone = parts[1] === 'none';
    const useAI = parts[parts.length - 1] === 'ai';

    let category = undefined;

    if (!isNone) {

      const categoryIndex = parseInt(parts[1]);
      const categories = await getCategories(config.apiUrl, config.username, config.password);
      if (categories[categoryIndex] !== undefined) {
        category = categories[categoryIndex];
      }
    }


    const token = await getToken(config.apiUrl, config.username, config.password);

    if (!token) {
      throw new Error('无法获取登录 Token');
    }

    let apiEndpoint = '';
    let requestBody = {};

    if (useAI) {

      if (category) {
        
        apiEndpoint = `${config.apiUrl}/api/ai/quick-add-with-category`;
        requestBody = {
          url: url,
          title: title,
          category: category
        };
      } else {
        apiEndpoint = `${config.apiUrl}/api/ai/quick-add-with-title`;
        requestBody = {
          url: url,
          title: title
        };
      }


      const notificationId = await showNotification({
        title: '🤖 AI 正在处理',
        message: '正在生成书签内容...',
        iconUrl: 'icons/LiteMark48.png',
        autoClear: false  // 不自动清除，等待手动清除
      });

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        let errorMessage = 'AI 添加失败';
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


      if (notificationId) {
        await new Promise(resolve => {
          chrome.notifications.clear(notificationId, () => {
            // 延迟 200ms 再显示新通知，确保旧通知完全清除
            setTimeout(resolve, 200);
          });
        });
      }


      const categoryText = bookmark.category ? ` · ${bookmark.category}` : '';
      await showNotification({
        title: '🤖 AI 添加成功',
        message: `${bookmark.title.substring(0, 40)}${categoryText}`,
        iconUrl: 'icons/LiteMark48.png',
        autoClear: true,
        duration: 5000
      });

      console.log('AI 书签添加成功:', bookmark);

    } else {

      apiEndpoint = `${config.apiUrl}/api/bookmarks`;
      requestBody = {
        title: title.substring(0, 200),
        url: url,
        category: category,
        visible: true
      };

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
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

      
      const categoryText = category ? ` · ${category}` : '';
      await showNotification({
        title: '✅ 添加成功',
        message: `${title.substring(0, 40)}${categoryText}`,
        iconUrl: 'icons/LiteMark48.png'
      });

      console.log('书签添加成功:', bookmark);
    }


    categoriesCache = null;
    categoriesCacheTime = 0;

    setTimeout(() => {
      createContextMenu();
    }, 1000);

  } catch (error) {
    console.error('添加书签失败:', error);
    throw error;
  }
}


async function getCategories(apiUrl, username, password) {

  const now = Date.now();
  if (categoriesCache && categoriesCacheTime > now) {
    return categoriesCache;
  }

  try {

    const token = await getToken(apiUrl, username, password);


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


    const categorySet = new Set();
    bookmarks.forEach(bookmark => {
      if (bookmark.category && bookmark.category.trim()) {
        categorySet.add(bookmark.category.trim());
      }
    });


    const categories = Array.from(categorySet).sort();

    categoriesCache = categories;
    categoriesCacheTime = now + CATEGORIES_CACHE_DURATION;

    console.log('获取到分类列表:', categories);
    return categories;

  } catch (error) {
    console.error('获取分类失败:', error);
    
    return [];
  }
}


async function getToken(apiUrl, username, password) {

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

    tokenExpiry = now + 60 * 60 * 1000;

    return tokenCache;
  } catch (error) {
    console.error('获取 Token 失败:', error);
    tokenCache = null;
    tokenExpiry = 0;
    throw error;
  }
}

async function showNotification({ title, message, iconUrl, autoClear = true, duration = 3000 }) {
  return new Promise((resolve, reject) => {
    const options = {
      type: 'basic',
      iconUrl: iconUrl || 'icons/LiteMark48.png',
      title: title,
      message: message,
      priority: 2,
      requireInteraction: false
    };

    chrome.notifications.create('', options, (notificationId) => {
      if (chrome.runtime.lastError) {
        console.error('通知创建失败:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
        return;
      }

      resolve(notificationId);

      // 根据参数决定是否自动清除通知
      if (autoClear) {
        setTimeout(() => {
          chrome.notifications.clear(notificationId);
        }, duration);
      }
    });
  });
}


chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && (changes.apiUrl || changes.username || changes.password || changes.enableAI)) {
    console.log('配置已更改，清除缓存并更新菜单');
    tokenCache = null;
    tokenExpiry = 0;
    categoriesCache = null;
    categoriesCacheTime = 0;
    createContextMenu();
  }
});
