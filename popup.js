async function loadConfig() {
  try {
    console.log('加载配置...');
    const result = await chrome.storage.sync.get(['apiUrl', 'username', 'password', 'enableAI']);
    console.log('从存储读取的配置:', {
      apiUrl: result.apiUrl,
      username: result.username,
      hasPassword: !!result.password,
      enableAI: result.enableAI
    });

    const apiUrlInput = document.getElementById('api-url');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const enableAICheckbox = document.getElementById('enable-ai');

    if (!apiUrlInput || !usernameInput || !passwordInput) {
      console.error('找不到输入框元素');
      return;
    }

    if (result.apiUrl) apiUrlInput.value = result.apiUrl;
    if (result.username) usernameInput.value = result.username;
    if (result.password) passwordInput.value = result.password;
    if (enableAICheckbox) enableAICheckbox.checked = result.enableAI || false;

    if (result.apiUrl && result.username && result.password) {
      console.log('已有配置，显示使用说明');
      showInfoSection();
      updateAIStatus(result.enableAI);
      await loadVersion(result.apiUrl);
    } else {
      console.log('无配置，显示配置区域');
      showConfigSection();
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
    const enableAI = document.getElementById('enable-ai').checked;

    console.log('配置值:', { apiUrl, username, password: password ? '***' : '', enableAI });

    if (!apiUrl || !username || !password) {
      showStatus('请填写所有配置项', 'error');
      return;
    }

    try {
      new URL(apiUrl);
    } catch (e) {
      showStatus('API 地址格式不正确，请输入完整的 URL（如：https://your-site.vercel.app）', 'error');
      return;
    }


    showStatus('正在测试连接...', 'info');

    try {
      const token = await login(apiUrl.replace(/\/$/, ''), username, password);
      if (!token) {
        throw new Error('登录失败，请检查用户名和密码');
      }
    } catch (error) {
      showStatus('连接失败：' + error.message, 'error');
      return;
    }

    console.log('保存到 chrome.storage...');
    await chrome.storage.sync.set({
      apiUrl: apiUrl.replace(/\/$/, ''), 
      username,
      password,
      enableAI
    });

    console.log('配置已保存到存储');

   
    const saved = await chrome.storage.sync.get(['apiUrl', 'username', 'enableAI']);
    console.log('验证保存结果:', saved);

    showStatus('✅ 配置保存成功！', 'success');

    setTimeout(() => {
      showInfoSection();
      updateAIStatus(enableAI);
      loadVersion(apiUrl.replace(/\/$/, ''));
    }, 1000);
  } catch (error) {
    console.error('保存配置时出错:', error);
    showStatus('保存失败：' + (error.message || '未知错误'), 'error');
  }
}

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


async function loadVersion(apiUrl) {
  try {
    const versionEl = document.getElementById('litemark-version');
    if (!versionEl) return;

    versionEl.textContent = '加载中...';
    versionEl.style.color = '#3b82f6';

    const response = await fetch(`${apiUrl}/version`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    versionEl.textContent = data.version || '未知';
    versionEl.style.color = '#3b82f6';
  } catch (error) {
    console.error('获取版本信息失败:', error);
    const versionEl = document.getElementById('litemark-version');
    if (versionEl) {
      versionEl.textContent = '获取失败';
      versionEl.style.color = '#ef4444';
    }
  }
}


function showConfigSection() {
  document.getElementById('config-section').style.display = 'block';
  document.getElementById('info-section').style.display = 'none';
}


function showInfoSection() {
  document.getElementById('config-section').style.display = 'none';
  document.getElementById('info-section').style.display = 'block';
}

function updateAIStatus(enabled) {
  const aiStatusDisplay = document.getElementById('ai-status-display');
  const aiEnabledText = document.getElementById('ai-enabled-text');
  const statusBadge = document.getElementById('ai-status-badge');

  if (aiStatusDisplay && aiEnabledText) {
    aiStatusDisplay.style.display = 'block';

    if (enabled) {
      aiEnabledText.textContent = '已启用';
      aiEnabledText.style.color = '#10b981';
      if (statusBadge) statusBadge.classList.remove('disabled');
    } else {
      aiEnabledText.textContent = '未启用';
      aiEnabledText.style.color = '#94a3b8';
      if (statusBadge) statusBadge.classList.add('disabled');
    }
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


function togglePasswordVisibility() {
  const passwordInput = document.getElementById('password');
  const eyeOpenIcon = document.querySelector('.eye-open');
  const eyeClosedIcon = document.querySelector('.eye-closed');
  const toggleBtn = document.getElementById('toggle-password');

  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    eyeOpenIcon.style.display = 'none';
    eyeClosedIcon.style.display = 'block';
    toggleBtn.setAttribute('aria-label', '隐藏密码');
  } else {
    passwordInput.type = 'password';
    eyeOpenIcon.style.display = 'block';
    eyeClosedIcon.style.display = 'none';
    toggleBtn.setAttribute('aria-label', '显示密码');
  }
}

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


function extractBookmarks(bookmarkNodes, useFolderAsCategory = false, parentFolder = null) {
  const bookmarks = [];

  for (const node of bookmarkNodes) {
    if (node.url) {

      bookmarks.push({
        title: node.title || node.url,
        url: node.url,
        category: useFolderAsCategory && parentFolder ? parentFolder : undefined
      });
    } else if (node.children) {

      const folderName = node.title && node.title.trim() ? node.title.trim() : null;
      const newParentFolder = useFolderAsCategory && folderName ? folderName : parentFolder;

      const childBookmarks = extractBookmarks(node.children, useFolderAsCategory, newParentFolder);
      bookmarks.push(...childBookmarks);
    }
  }

  return bookmarks;
}


async function importBookmarks() {
  const progressDiv = document.getElementById('import-progress');
  const progressText = document.getElementById('progress-text');
  const progressFill = document.getElementById('progress-fill');
  const progressDetails = document.getElementById('progress-details');
  const progressPercentage = document.getElementById('progress-percentage');
  const importBtn = document.getElementById('import-bookmarks');

  try {

    const config = await chrome.storage.sync.get(['apiUrl', 'username', 'password']);

    if (!config.apiUrl || !config.username || !config.password) {
      showStatus('请先配置 LiteMark 地址和登录信息', 'error');
      return;
    }


    const useFolderAsCategory = document.getElementById('use-folder-as-category').checked;

    progressDiv.style.display = 'block';
    importBtn.disabled = true;
    importBtn.innerHTML = '<span class="loading"></span><span>导入中...</span>';

    progressText.textContent = '正在读取浏览器收藏夹...';
    progressPercentage.textContent = '10%';
    progressFill.style.width = '10%';

    const bookmarkTree = await getBrowserBookmarks();
    const bookmarks = extractBookmarks(bookmarkTree, useFolderAsCategory);

    if (bookmarks.length === 0) {
      showStatus('未找到任何收藏夹', 'error');
      progressDiv.style.display = 'none';
      importBtn.disabled = false;
      importBtn.innerHTML = '<span class="btn-icon">📥</span><span>开始导入</span>';
      return;
    }

    progressText.textContent = `找到 ${bookmarks.length} 个收藏，开始导入...`;
    progressDetails.textContent = `准备导入 ${bookmarks.length} 个书签`;


    const token = await login(config.apiUrl, config.username, config.password);

    if (!token) {
      throw new Error('无法获取登录 Token');
    }


    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (let i = 0; i < bookmarks.length; i++) {
      const bookmark = bookmarks[i];
      const progress = Math.round(((i + 1) / bookmarks.length) * 90) + 10; // 10% 到 100%

      progressFill.style.width = `${progress}%`;
      progressPercentage.textContent = `${progress}%`;
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


      if (i < bookmarks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }


    progressFill.style.width = '100%';
    progressPercentage.textContent = '100%';

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
    importBtn.innerHTML = '<span class="btn-icon">📥</span><span>开始导入</span>';


    setTimeout(() => {
      progressDiv.style.display = 'none';
    }, 5000);

  } catch (error) {
    console.error('导入收藏夹失败:', error);
    showStatus('导入失败：' + (error.message || '未知错误'), 'error');

    if (importBtn) {
      importBtn.disabled = false;
      importBtn.innerHTML = '<span class="btn-icon">📥</span><span>开始导入</span>';
    }
    if (progressDiv) {
      progressDiv.style.display = 'none';
    }
  }
}

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

        saveBtn.disabled = true;
        const originalHTML = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span class="loading"></span><span>保存中...</span>';

        try {
          await saveConfig();
        } catch (err) {
          console.error('保存配置错误:', err);
          showStatus('保存失败：' + (err.message || '未知错误'), 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.innerHTML = originalHTML;
        }
      });
    } else {
      console.error('找不到 save-config 按钮');
    }


    const importBtn = document.getElementById('import-bookmarks');
    if (importBtn) {
      importBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('点击导入收藏夹按钮');
        await importBookmarks();
      });
    }


    const showConfigBtn = document.getElementById('show-config');
    if (showConfigBtn) {
      showConfigBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showConfigSection();
      });
    }

    const togglePasswordBtn = document.getElementById('toggle-password');
    if (togglePasswordBtn) {
      togglePasswordBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePasswordVisibility();
      });
    }

    // 配置输入框回车事件
    const configInputs = document.querySelectorAll('#config-section input');
    configInputs.forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveBtn?.click();
        }
      });
    });

  } catch (error) {
    console.error('初始化错误:', error);
    showStatus('初始化失败：' + error.message, 'error');
  }
});
