// 配置管理
async function loadConfig() {
  try {
    console.log('加载配置...');
    const result = await chrome.storage.sync.get(['apiUrl', 'username', 'password']);
    console.log('从存储读取的配置:', { 
      apiUrl: result.apiUrl, 
      username: result.username, 
      hasPassword: !!result.password 
    });
    
    const apiUrlInput = document.getElementById('api-url');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    
    if (!apiUrlInput || !usernameInput || !passwordInput) {
      console.error('找不到输入框元素');
      return;
    }
    
    if (result.apiUrl) {
      apiUrlInput.value = result.apiUrl;
    }
    if (result.username) {
      usernameInput.value = result.username;
    }
    if (result.password) {
      passwordInput.value = result.password;
    }
    
    // 如果有配置，显示使用说明
    if (result.apiUrl && result.username && result.password) {
      console.log('已有配置，显示使用说明');
      document.getElementById('config-section').style.display = 'none';
      document.getElementById('info-section').style.display = 'block';
    } else {
      console.log('无配置，显示配置区域');
      document.getElementById('config-section').style.display = 'block';
      document.getElementById('info-section').style.display = 'none';
    }
  } catch (error) {
    console.error('加载配置错误:', error);
    showStatus('加载配置失败：' + error.message, 'error');
  }
}

async function saveConfig() {
  try {
    console.log('开始保存配置...');
    
    const apiUrl = document.getElementById('api-url').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    console.log('配置值:', { apiUrl, username, password: password ? '***' : '' });

    if (!apiUrl || !username || !password) {
      showStatus('请填写所有配置项', 'error');
      return;
    }

    // 验证 URL 格式
    try {
      new URL(apiUrl);
    } catch (e) {
      showStatus('API 地址格式不正确，请输入完整的 URL（如：https://your-site.vercel.app）', 'error');
      return;
    }

    console.log('保存到 chrome.storage...');
    await chrome.storage.sync.set({
      apiUrl: apiUrl.replace(/\/$/, ''), // 移除末尾斜杠
      username,
      password
    });

    console.log('配置已保存到存储');
    
    // 验证保存是否成功
    const saved = await chrome.storage.sync.get(['apiUrl', 'username']);
    console.log('验证保存结果:', saved);

    showStatus('配置已保存', 'success');
    
    setTimeout(() => {
      document.getElementById('config-section').style.display = 'none';
      document.getElementById('info-section').style.display = 'block';
    }, 1000);
  } catch (error) {
    console.error('保存配置时出错:', error);
    showStatus('保存失败：' + (error.message || '未知错误'), 'error');
  }
}

// 登录获取 Token
async function login(apiUrl, username, password) {
  try {
    const response = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      let errorMessage = '登录失败';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('登录失败：' + String(error));
  }
}

function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  setTimeout(() => {
    statusEl.className = 'status';
  }, 5000);
}

// 获取浏览器收藏夹
async function getBrowserBookmarks() {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(bookmarkTreeNodes);
    });
  });
}

// 递归提取所有书签
function extractBookmarks(bookmarkNodes, useFolderAsCategory = false, parentFolder = null) {
  const bookmarks = [];
  
  for (const node of bookmarkNodes) {
    if (node.url) {
      // 这是一个书签
      bookmarks.push({
        title: node.title || node.url,
        url: node.url,
        category: useFolderAsCategory && parentFolder ? parentFolder : undefined
      });
    } else if (node.children) {
      // 这是一个文件夹
      const folderName = node.title && node.title.trim() ? node.title.trim() : null;
      const newParentFolder = useFolderAsCategory && folderName ? folderName : parentFolder;
      // 递归处理子节点
      const childBookmarks = extractBookmarks(node.children, useFolderAsCategory, newParentFolder);
      bookmarks.push(...childBookmarks);
    }
  }
  
  return bookmarks;
}

// 导入收藏夹
async function importBookmarks() {
  try {
    // 获取配置
    const config = await chrome.storage.sync.get(['apiUrl', 'username', 'password']);
    
    if (!config.apiUrl || !config.username || !config.password) {
      showStatus('请先配置 LiteMark 地址和登录信息', 'error');
      return;
    }

    // 获取选项
    const useFolderAsCategory = document.getElementById('use-folder-as-category').checked;
    
    // 显示进度
    const progressDiv = document.getElementById('import-progress');
    const progressText = document.getElementById('progress-text');
    const progressFill = document.getElementById('progress-fill');
    const progressDetails = document.getElementById('progress-details');
    const importBtn = document.getElementById('import-bookmarks');
    
    progressDiv.style.display = 'block';
    importBtn.disabled = true;
    importBtn.textContent = '导入中...';
    
    // 获取浏览器收藏夹
    progressText.textContent = '正在读取浏览器收藏夹...';
    progressFill.style.width = '10%';
    
    const bookmarkTree = await getBrowserBookmarks();
    const bookmarks = extractBookmarks(bookmarkTree, useFolderAsCategory);
    
    if (bookmarks.length === 0) {
      showStatus('未找到任何收藏夹', 'error');
      progressDiv.style.display = 'none';
      importBtn.disabled = false;
      importBtn.textContent = '导入收藏夹';
      return;
    }
    
    progressText.textContent = `找到 ${bookmarks.length} 个收藏，开始导入...`;
    progressDetails.textContent = `准备导入 ${bookmarks.length} 个书签`;
    
    // 获取 Token
    const token = await login(config.apiUrl, config.username, config.password);
    
    if (!token) {
      throw new Error('无法获取登录 Token');
    }
    
    // 批量导入
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    
    for (let i = 0; i < bookmarks.length; i++) {
      const bookmark = bookmarks[i];
      const progress = Math.round(((i + 1) / bookmarks.length) * 90) + 10; // 10% 到 100%
      
      progressFill.style.width = `${progress}%`;
      progressText.textContent = `正在导入 ${i + 1}/${bookmarks.length}...`;
      progressDetails.textContent = `成功: ${successCount} | 失败: ${failCount}`;
      
      try {
        const response = await fetch(`${config.apiUrl}/api/bookmarks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            title: bookmark.title.substring(0, 200),
            url: bookmark.url,
            category: bookmark.category,
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
        
        successCount++;
      } catch (error) {
        failCount++;
        errors.push({
          title: bookmark.title,
          url: bookmark.url,
          error: error.message || '未知错误'
        });
        console.error(`导入书签失败: ${bookmark.title}`, error);
      }
      
      // 添加小延迟，避免请求过快
      if (i < bookmarks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // 完成
    progressFill.style.width = '100%';
    
    if (failCount === 0) {
      progressText.textContent = `✅ 导入完成！成功导入 ${successCount} 个书签`;
      progressDetails.textContent = '';
      showStatus(`成功导入 ${successCount} 个书签`, 'success');
    } else {
      progressText.textContent = `⚠️ 导入完成：成功 ${successCount} 个，失败 ${failCount} 个`;
      progressDetails.textContent = `失败的书签已记录到控制台`;
      showStatus(`导入完成：成功 ${successCount} 个，失败 ${failCount} 个`, 'error');
      console.error('导入失败的书签:', errors);
    }
    
    importBtn.disabled = false;
    importBtn.textContent = '导入收藏夹';
    
    // 3秒后隐藏进度条
    setTimeout(() => {
      progressDiv.style.display = 'none';
    }, 5000);
    
  } catch (error) {
    console.error('导入收藏夹失败:', error);
    showStatus('导入失败：' + (error.message || '未知错误'), 'error');
    
    const importBtn = document.getElementById('import-bookmarks');
    const progressDiv = document.getElementById('import-progress');
    
    if (importBtn) {
      importBtn.disabled = false;
      importBtn.textContent = '导入收藏夹';
    }
    if (progressDiv) {
      progressDiv.style.display = 'none';
    }
  }
}

// 事件监听
document.addEventListener('DOMContentLoaded', async () => {
  console.log('扩展已加载');
  
  try {
    await loadConfig();
    console.log('配置加载完成');

    const saveBtn = document.getElementById('save-config');
    
    if (saveBtn) {
      saveBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('点击保存配置按钮');
        
        // 禁用按钮防止重复点击
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
        
        try {
          await saveConfig();
        } catch (err) {
          console.error('保存配置错误:', err);
          showStatus('保存失败：' + (err.message || '未知错误'), 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = '保存配置';
        }
      });
    } else {
      console.error('找不到 save-config 按钮');
      showStatus('初始化错误：找不到保存按钮', 'error');
    }
    
    // 导入收藏夹按钮
    const importBtn = document.getElementById('import-bookmarks');
    if (importBtn) {
      importBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('点击导入收藏夹按钮');
        await importBookmarks();
      });
    }
  } catch (error) {
    console.error('初始化错误:', error);
    showStatus('初始化失败：' + error.message, 'error');
  }
});

